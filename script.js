document.addEventListener('DOMContentLoaded', function() {
    const symptomSearch = document.getElementById('symptomSearch');
    const symptomsDropdown = document.getElementById('symptomsDropdown');
    const selectedSymptomsList = document.getElementById('selectedSymptoms');
    const predictionForm = document.getElementById('predictionForm');
    const resultsDiv = document.getElementById('results');
	const chartCanvas = document.getElementById('predictionsChart');
    const API_URL = 'https://health-detective-api.onrender.com';  // Backend server URL

    let allSymptoms = [];
    let selectedSymptoms = new Set();
	let predictionsChart = null;

	function getAllSymptomsFromLocal() {
		try {
			if (typeof diseaseData !== 'object' || !diseaseData) return [];
			const all = Object.values(diseaseData).flatMap(d => Array.isArray(d.symptoms) ? d.symptoms : []);
			return [...new Set(all)].sort();
		} catch (e) {
			console.error('Local fallback failed to extract symptoms:', e);
			return [];
		}
	}

	function buildLocalPredictions(selected) {
		if (typeof diseaseData !== 'object' || !diseaseData) return [];
		const selectedLower = new Set(Array.from(selected).map(s => String(s).toLowerCase()));
		const predictions = Object.entries(diseaseData).map(([name, info]) => {
			const symptoms = Array.isArray(info.symptoms) ? info.symptoms : [];
			const symptomsLower = symptoms.map(s => String(s).toLowerCase());
			const overlap = symptomsLower.filter(s => selectedLower.has(s)).length;
			const base = symptomsLower.length || 1;
			const match = base > 0 ? (overlap / base) * 100 : 0;
			return {
				disease: name,
				match_percentage: match,
				description: info.description || '',
				precautions: Array.isArray(info.precautions) ? info.precautions : [],
				medications: Array.isArray(info.medications) ? info.medications : []
			};
		}).filter(p => p.match_percentage > 0)
		 .sort((a, b) => b.match_percentage - a.match_percentage)
		 .slice(0, 10);
		return predictions;
	}

    // Load all unique symptoms from the backend
	async function loadSymptoms() {
        try {
            console.log('Fetching symptoms from:', `${API_URL}/diseases`);
            resultsDiv.innerHTML = '<div class="alert alert-info">Loading symptoms...</div>';
            
            const response = await fetch(`${API_URL}/diseases`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
            
            console.log('Response status:', response.status);
            console.log('Response headers:', response.headers);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Received data:', data);
            
			if (data.diseases && Array.isArray(data.diseases)) {
                allSymptoms = [...new Set(data.diseases.flatMap(disease => disease.symptoms))].sort();
                console.log('Extracted symptoms:', allSymptoms.length);
                updateSymptomsDropdown();
                resultsDiv.innerHTML = '<div class="alert alert-success">Symptoms loaded successfully!</div>';
            } else {
                throw new Error('Invalid data format received from API');
            }
        } catch (error) {
            console.error('Error loading symptoms:', error);
			// Fallback to local data if available
			const local = getAllSymptomsFromLocal();
			if (local.length > 0) {
				allSymptoms = local;
				updateSymptomsDropdown();
				resultsDiv.innerHTML = `
					<div class="alert alert-warning" role="alert">
						Online API unavailable (GET ${API_URL}/diseases). Using local dataset for symptoms.
					</div>
				`;
			} else {
				resultsDiv.innerHTML = `
					<div class="alert alert-danger" role="alert">
						Error loading symptoms: ${error.message}
						<br>API URL: ${API_URL}/diseases
					</div>
				`;
			}
        }
    }

    // Function to update the symptoms dropdown based on search
    function updateSymptomsDropdown() {
        const searchTerm = symptomSearch.value.toLowerCase();
        const filteredSymptoms = allSymptoms.filter(symptom => 
            symptom.includes(searchTerm)
        );

        symptomsDropdown.innerHTML = filteredSymptoms.map(symptom => `
            <li>
                <a class="dropdown-item ${selectedSymptoms.has(symptom) ? 'active' : ''}" href="#" data-symptom="${symptom}">
                    ${symptom}
                </a>
            </li>
        `).join('');

        // Add event listeners to dropdown items
        symptomsDropdown.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', function(e) {
                e.preventDefault();
                const symptom = this.dataset.symptom;
                if (this.classList.contains('active')) {
                    selectedSymptoms.delete(symptom);
                    this.classList.remove('active');
                } else {
                    selectedSymptoms.add(symptom);
                    this.classList.add('active');
                }
                updateSelectedSymptoms();
            });
        });
    }

    // Function to update the selected symptoms list
    function updateSelectedSymptoms() {
        selectedSymptomsList.innerHTML = Array.from(selectedSymptoms).map(symptom => `
            <span class="badge bg-primary me-2 mb-2">
                ${symptom}
                <button type="button" class="btn-close btn-close-white ms-2" aria-label="Remove" data-symptom="${symptom}"></button>
            </span>
        `).join('');

        // Add event listeners to remove buttons
        selectedSymptomsList.querySelectorAll('.btn-close').forEach(button => {
            button.addEventListener('click', function() {
                const symptom = this.dataset.symptom;
                selectedSymptoms.delete(symptom);
                updateSelectedSymptoms();
                updateSymptomsDropdown();
            });
        });
    }

    // Event listener for symptom search input
    symptomSearch.addEventListener('input', updateSymptomsDropdown);

    // Add event listener for Enter key press
    symptomSearch.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const searchTerm = this.value.trim().toLowerCase();
            if (searchTerm) {
                // Find the exact match or first partial match
                const matchingSymptom = allSymptoms.find(symptom => 
                    symptom.toLowerCase() === searchTerm || 
                    symptom.toLowerCase().includes(searchTerm)
                );
                
                if (matchingSymptom) {
                    if (!selectedSymptoms.has(matchingSymptom)) {
                        selectedSymptoms.add(matchingSymptom);
                        updateSelectedSymptoms();
                        updateSymptomsDropdown();
                    }
                    this.value = ''; // Clear the search input
                }
            }
        }
    });

    // Event listener for form submission
    predictionForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        if (selectedSymptoms.size === 0) {
            resultsDiv.innerHTML = `
                <div class="alert alert-warning" role="alert">
                    Please select at least one symptom
                </div>
            `;
            return;
        }

		try {
            console.log('Sending symptoms:', Array.from(selectedSymptoms));
            const response = await fetch(`${API_URL}/predict`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    symptoms: Array.from(selectedSymptoms)
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

			const data = await response.json();
			console.log('Received prediction:', data);
			displayResults(data.predictions);
        } catch (error) {
			console.error('Error calling API, attempting local prediction fallback:', error);
			const localPreds = buildLocalPredictions(selectedSymptoms);
			if (localPreds.length > 0) {
				resultsDiv.innerHTML = `
					<div class="alert alert-warning" role="alert">
						Online API unavailable (POST ${API_URL}/predict). Showing local estimates based on bundled dataset.
					</div>
				`;
				displayResults(localPreds);
			} else {
				resultsDiv.innerHTML = `
					<div class="alert alert-danger" role="alert">
						Error: ${error.message}
						<br>API URL: ${API_URL}/predict
					</div>
				`;
			}
        }
    });

    // Function to display results
	function displayResults(predictions) {
		// Update chart first
		if (predictionsChart) {
			predictionsChart.destroy();
			predictionsChart = null;
		}

		if (!predictions || predictions.length === 0) {
			resultsDiv.innerHTML = `
				<div class="alert alert-info" role="alert">
					No matching diseases found. Please try different symptoms.
				</div>
			`;
			return;
		}

		const labels = predictions.map(p => p.disease);
		const data = predictions.map(p => Number(p.match_percentage.toFixed ? p.match_percentage.toFixed(1) : p.match_percentage));

		if (chartCanvas && window.Chart) {
			const ctx = chartCanvas.getContext('2d');
			predictionsChart = new Chart(ctx, {
				type: 'bar',
				data: {
					labels,
					datasets: [{
						label: 'Match %',
						data,
						backgroundColor: 'rgba(239, 68, 68, 0.6)',
						borderColor: 'rgba(239, 68, 68, 1)',
						borderWidth: 1,
						maxBarThickness: 40
					}]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					scales: {
						y: {
							beginAtZero: true,
							max: 100,
							grid: { color: 'rgba(255,255,255,0.08)' },
							ticks: { color: '#fff', callback: v => v + '%' }
						},
						x: {
							grid: { color: 'rgba(255,255,255,0.05)' },
							ticks: { color: '#fff' }
						}
					},
					plugins: {
						legend: { labels: { color: '#fff' } },
						tooltip: {
							callbacks: {
								label: ctx => `${ctx.parsed.y}%`
							}
						}
					}
				}
			});
		}

		// Update textual results
		resultsDiv.innerHTML = predictions.map(prediction => `
			<div class="card mb-3">
				<div class="card-header">
					<h5 class="mb-0">${prediction.disease}</h5>
					<small class="text-muted">Match: ${prediction.match_percentage.toFixed(1)}%</small>
				</div>
				<div class="card-body">
					<p class="card-text">${prediction.description}</p>
					<h6>Precautions:</h6>
					<ul>
						${prediction.precautions.map(precaution => `<li>${precaution}</li>`).join('')}
					</ul>
					<h6>Medications:</h6>
					<ul>
						${prediction.medications.map(medication => `<li>${medication}</li>`).join('')}
					</ul>
				</div>
			</div>
		`).join('');
	}

    // Initialize the application
    loadSymptoms();
}); 
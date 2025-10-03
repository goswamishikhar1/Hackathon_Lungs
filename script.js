document.addEventListener('DOMContentLoaded', function() {
    const symptomSearch = document.getElementById('symptomSearch');
    const symptomsDropdown = document.getElementById('symptomsDropdown');
    const selectedSymptomsList = document.getElementById('selectedSymptoms');
    const predictionForm = document.getElementById('predictionForm');
    const resultsDiv = document.getElementById('results');
	const chartCanvas = document.getElementById('predictionsChart');
    // Demo mode: load from disease.json (expanded to 500 demo records client-side)

    let allSymptoms = [];
    let selectedSymptoms = new Set();
    let predictionsChart = null;
    let diseaseData = {};

    function getAllSymptomsFromLocal() {
        try {
            if (typeof diseaseData !== 'object' || !diseaseData) return [];
            const all = Object.values(diseaseData).flatMap(d => Array.isArray(d.symptoms) ? d.symptoms : []);
            return [...new Set(all)].sort();
        } catch (e) {
            console.error('Local extraction failed:', e);
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

    // Load all unique symptoms from disease.json and expand to ~500 demo records
    async function loadSymptoms() {
        resultsDiv.innerHTML = '<div class="alert alert-info">Loading demo data...</div>';
        try {
            const res = await fetch('disease.json', { headers: { 'Accept': 'application/json' } });
            if (!res.ok) throw new Error(`Failed to load disease.json (${res.status})`);
            const baseList = await res.json(); // Expecting an array of seed diseases

            // Expand to 500 demo entries by cloning with suffixes
            const expanded = [];
            const copiesNeeded = Math.ceil(500 / baseList.length);
            for (let i = 0; i < copiesNeeded; i++) {
                for (const item of baseList) {
                    const suffix = i === 0 ? '' : ` #${i+1}`;
                    expanded.push({
                        name: `${item.name}${suffix}`,
                        description: item.description,
                        symptoms: item.symptoms,
                        precautions: item.precautions,
                        medications: item.medications
                    });
                    if (expanded.length >= 500) break;
                }
                if (expanded.length >= 500) break;
            }

            // Build map
            diseaseData = expanded.reduce((acc, d) => {
                acc[d.name] = {
                    description: d.description,
                    symptoms: d.symptoms,
                    precautions: d.precautions,
                    medications: d.medications
                };
                return acc;
            }, {});

            allSymptoms = getAllSymptomsFromLocal();
            updateSymptomsDropdown();
            resultsDiv.innerHTML = '<div class="alert alert-success">Demo data loaded. Select symptoms to see predictions.</div>';
        } catch (e) {
            console.error('Failed to load local disease.json:', e);
            resultsDiv.innerHTML = '<div class="alert alert-danger">Failed to load local demo data.</div>';
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

    // Event listener for form submission (local predictions only)
    predictionForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        if (selectedSymptoms.size === 0) {
            resultsDiv.innerHTML = `
                <div class="alert alert-warning" role="alert">
                    Please select at least one symptom
                </div>
            `;
            return;
        }

        const localPreds = buildLocalPredictions(selectedSymptoms);
        displayResults(localPreds);
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
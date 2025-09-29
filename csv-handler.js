// CSV File Processing Functions
function processFile(file) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
        alert('Please select a valid CSV file.');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            processCSV(e.target.result, file.name);
        } catch (error) {
            alert('Error processing CSV file: ' + error.message);
        }
    };
    reader.readAsText(file);
}

function processCSV(csvContent, fileName) {
    // Remove BOM if present and handle different line endings
    csvContent = csvContent.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) {
        alert('CSV file must contain at least a header and one data row.');
        return;
    }

    // Parse headers with smart column detection
    const rawHeaders = parseCSVLine(lines[0]);
    const headers = rawHeaders.map(h => h.trim());
    const normalized = headers.map(h => h.replace(/\s+/g, '').toLowerCase());

    console.log('Detected headers:', rawHeaders);

    // Accept common variants for store/location, participation and area columns
    const storeIndex = normalized.findIndex(h =>
        ['store', 'storename', 'shop', 'branch', 'location', 'sitename', 'outlet']
            .some(key => h.includes(key))
    );
    const participationIndex = normalized.findIndex(h =>
        ['participation%', 'participation', 'participationpercent', 'participationpercentage', 'percent', 'percentage']
            .some(key => h.includes(key))
    );
    const areaCodeIndex = normalized.findIndex(h =>
        h === 'areacode' || h.includes('areacode')
    );

    console.log('Store column index:', storeIndex, 'Participation column index:', participationIndex, 'Area code index:', areaCodeIndex);

    if (storeIndex === -1 || participationIndex === -1) {
        alert(
            'CSV must contain "Store/Location" and "Participation %" columns.\n' +
            'Detected headers: ' + rawHeaders.join(', ')
        );
        return;
    }

    // Store previous data for movement calculation
    window.previousData = [...window.allStoreData];

    // Process new data
    const newData = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue; // Skip empty lines
        
        const values = parseCSVLine(lines[i]);
        
        const maxIndex = Math.max(storeIndex, participationIndex, areaCodeIndex !== -1 ? areaCodeIndex : 0);
        if (values.length > maxIndex) {
            const store = values[storeIndex]?.trim();
            let participationRaw = values[participationIndex]?.trim();
            const areaCode = areaCodeIndex !== -1 ? values[areaCodeIndex]?.trim() : null;
            
            if (store && participationRaw) {
                // Clean up participation value - remove %, handle decimals properly
                participationRaw = participationRaw.replace('%', '').replace(/,/g, '');
                const participation = parseFloat(participationRaw);
                
                if (!isNaN(participation) && participation >= 0 && participation <= 100) {
                    const storeData = { store, participation };
                    if (areaCode) {
                        storeData.areaCode = areaCode;
                    }
                    newData.push(storeData);
                } else if (!isNaN(participation)) {
                    console.warn(`Suspicious participation value for ${store}: ${participation}%`);
                    const storeData = { store, participation };
                    if (areaCode) {
                        storeData.areaCode = areaCode;
                    }
                    newData.push(storeData);
                }
            }
        }
    }

    console.log('Processed data:', newData);

    if (newData.length === 0) {
        alert('No valid data found in CSV file.');
        return;
    }

    window.allStoreData = newData;
    
    // Update upload history
    window.uploadHistory.push({
        fileName: fileName || 'Unknown File',
        uploadTime: new Date().toLocaleString(),
        recordCount: newData.length
    });

    window.processData();
    window.saveDataToStorage();
    
    // Show success message with data summary
    const successMsg = `Successfully processed ${newData.length} store records!\n\n` +
        `Summary:\n` +
        `- Total stores: ${newData.length}\n` +
        `- Average participation: ${(newData.reduce((sum, s) => sum + s.participation, 0) / newData.length).toFixed(1)}%\n` +
        `- Best store: ${newData.sort((a, b) => b.participation - a.participation)[0].store} (${newData[0].participation.toFixed(1)}%)\n` +
        `- Areas detected: ${new Set(newData.map(s => s.areaCode || extractAreaInfo(s).code)).size}`;
    
    setTimeout(() => alert(successMsg), 100);
}

// Enhanced CSV line parser that handles quoted values
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

// Extract area information from store name or code
function extractAreaInfo(store) {
    // First, try to use the areaCode field from CSV if available
    if (store.areaCode && store.areaCode.trim() && store.areaCode !== '') {
        const areaCode = store.areaCode.trim().toUpperCase();
        const areaMatch = areaCode.match(/A(\d+)/i);
        if (areaMatch) {
            const areaNumber = parseInt(areaMatch[1]);
            return {
                code: areaCode,
                number: areaNumber,
                display: `Area ${areaNumber}`
            };
        }
    }
    
    // Fallback: Extract area code from store name (e.g., "A031" from store name)
    const areaMatch = store.store.match(/A(\d{3})/i);
    if (areaMatch) {
        const areaNumber = parseInt(areaMatch[1]);
        return {
            code: areaMatch[0].toUpperCase(),
            number: areaNumber,
            display: `Area ${areaNumber}`
        };
    }
    
    // If no area code found, try to extract from other patterns
    const areaPattern = store.store.match(/area\s*(\d+)/i);
    if (areaPattern) {
        const areaNumber = parseInt(areaPattern[1]);
        return {
            code: `A${areaNumber.toString().padStart(3, '0')}`,
            number: areaNumber,
            display: `Area ${areaNumber}`
        };
    }
    
    return {
        code: 'UNKNOWN',
        number: 0,
        display: 'No Area'
    };
}
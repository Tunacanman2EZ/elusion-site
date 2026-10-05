// Kingdom name
const kingdomInput = document.querySelector('#kingdom-input');
const kingdomButton = document.querySelector('#kingdom-button');
const kingdomName = document.querySelector('.kingdom-name');

// Capital
const capitalInput = document.querySelector('#capital-input');
const capitalButton = document.querySelector('#capital-button');
const capitalValue = document.querySelector('.capital-value');

// Region
const regionInput = document.querySelector('#region-input');
const regionButton = document.querySelector('#region-button');
const regionValue = document.querySelector('.region-value');

// Threat level
const threatInput = document.querySelector('#threat-input');
const threatButton = document.querySelector('#threat-button');
const threatValue = document.querySelector('.threat-value');

// Ruler
const rulerInput = document.querySelector('#ruler-input');
const rulerButton = document.querySelector('#ruler-button');
const rulerValue = document.querySelector('.ruler-value');

kingdomButton.addEventListener('click', async function () {
  const newName = kingdomInput.value.trim();

  try {
    const response = await fetch(
      `https://restcountries.com/v3.1/name/${newName}`
    );

    // If HTTP error (like 404), throw so we jump to catch
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }

    const data = await response.json();

    // data is now an array like [ { ...country... } ]
    if (!Array.isArray(data) || data.length === 0) {
      kingdomName.textContent = 'Country not found';
      capitalValue.textContent = '';
      regionValue.textContent = '';
      console.log('No country found for:', newName);
      return;
    }

    console.log(data);
    console.log('Name:', data[0].name.common);
    console.log('Capital:', data[0].capital[0]);
    console.log('Region:', data[0].region);

    kingdomName.textContent = data[0].name.common;
    capitalValue.textContent = data[0].capital[0];
    regionValue.textContent = data[0].region;
  } catch (error) {
    console.log('Error fetching country:', error);
    kingdomName.textContent = 'Country not found';
    capitalValue.textContent = '';
    regionValue.textContent = '';
  }
});
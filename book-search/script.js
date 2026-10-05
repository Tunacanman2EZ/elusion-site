const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const resultsList = document.getElementById('results-list');

searchButton.addEventListener('click', () => {
  const searchTerm = searchInput.value.trim();

  if (!searchTerm) {
    resultsList.innerHTML = '';
    const li = document.createElement('li');
    li.textContent = 'Please type something to search.';
    resultsList.appendChild(li);
    return;
  }

  searchBooks(searchTerm);
});

async function searchBooks(searchTerm) {
  console.log('Searching for:', searchTerm);
  resultsList.innerHTML = '';
  
  const loadingItem = document.createElement('li');
  loadingItem.textContent = 'Loading...';
  resultsList.appendChild(loadingItem);

  const encodedTerm = encodeURIComponent(searchTerm);
  const url = `https://openlibrary.org/search.json?q=${encodedTerm}`;

  console.log('Fetching URL:', url);

  const response = await fetch(url);
  const data = await response.json();

  console.log('Fetched data:', data);

  // ---- rendering starts here, still inside searchBooks ----
  resultsList.innerHTML = '';

  const books = data.docs.slice(0, 10);

  if (books.length === 0) {
    const li = document.createElement('li');
    li.textContent = `No results found for "${searchTerm}".`;
    resultsList.appendChild(li);
    return;
  }

  for (const book of books) {
    const li = document.createElement('li');
    const title = book.title || 'No title';
    const author =
      book.author_name && book.author_name[0]
        ? book.author_name[0]
        : 'Unknown author';

    li.textContent = `${title} — ${author}`;
    resultsList.appendChild(li);
  }
}
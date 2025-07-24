# PageScribe

PageScribe is a powerful Chrome extension for web content extraction and site crawling. It allows you to save the main content of any webpage as a clean, readable Markdown file, extract keywords, and crawl an entire website to a specified depth.

## Features

- **Readable Content Extraction:** Uses Mozilla's Readability library to extract the main content of a webpage, removing ads, banners, and other clutter.
- **Save as Markdown:** Saves the extracted content as a well-formatted Markdown file, perfect for archiving, research, or offline reading.
- **Keyword Extraction:** Analyzes the page content to identify and extract the most relevant keywords.
- **Site Crawling:** Crawls a website to a user-defined depth, extracting the content from each page and saving the results in a single JSON file.
- **Modern UI:** A clean, intuitive, and responsive user interface for a seamless experience.

## How to Use

1.  **Process:**
    -   Navigate to the webpage you want to process.
    -   Open the PageScribe extension popup.
    -   In the "Process" tab, choose an action:
        -   **Save Full Content:** Extracts the main article and saves it as a Markdown file.
        -   **Extract Keywords:** Analyzes the text and displays a list of keywords.
    -   Click "Go" to perform the selected action.

2.  **Crawl:**
    -   Navigate to the starting URL for the crawl.
    -   Open the PageScribe extension popup and go to the "Crawl" tab.
    -   Set the **Crawl Depth** (how many links deep to follow).
    -   Choose whether to **Stay on domain**.
    -   Click "Start Crawl." The process will run in the background, and you will be prompted to save the results as a JSON file when it's complete.

3.  **History:**
    -   The "History" tab displays a record of your extracted keywords.

## Installation

To install and run PageScribe locally, follow these steps:

1.  **Clone the repository:**
    ```sh
    git clone <repository-url>
    cd chrome-ext-llm
    ```

2.  **Install dependencies:**
    ```sh
    bun install
    ```

3.  **Build the extension:**
    ```sh
    bun run build
    ```

4.  **Load the extension in Chrome:**
    -   Open Chrome and navigate to `chrome://extensions`.
    -   Enable "Developer mode."
    -   Click "Load unpacked."
    -   Select the `.output/chrome-mv3` directory from the project folder.

The PageScribe extension should now be installed and ready to use.
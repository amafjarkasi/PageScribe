import asyncio
from playwright.async_api import async_playwright
import os

async def main():
    # Path to the extension
    extension_path = os.path.abspath('.output/chrome-mv3')
    user_data_dir = '/tmp/test-user-data-dir'

    # Launch browser with extension
    async with async_playwright() as p:
        browser_context = await p.chromium.launch_persistent_context(
            user_data_dir,
            headless=True,
            args=[
                f'--disable-extensions-except={extension_path}',
                f'--load-extension={extension_path}',
            ]
        )

        try:
            # Get the extension's service worker
            service_worker = None
            for sw in browser_context.service_workers:
                if sw.url.startswith("chrome-extension://"):
                    service_worker = sw
                    break
            if not service_worker:
                service_worker = await browser_context.wait_for_event("serviceworker", timeout=60000)

            extension_id = service_worker.url.split('/')[2]

            # Test on a sample blog page
            page = await browser_context.new_page()
            await page.goto('https://surgegraph.io/content/sample-blog-post', wait_until='load', timeout=60000)

            # Open the popup
            popup_page = await browser_context.new_page()
            await popup_page.goto(f'chrome-extension://{extension_id}/popup.html')

            # Wait for the popup to load
            await popup_page.wait_for_selector('#action-select', timeout=10000)

            # Interact with the popup
            await popup_page.select_option('#action-select', 'summarize')
            await popup_page.click('.primary-button')

            # Wait for the result to be displayed
            await popup_page.wait_for_selector('.result-box p', timeout=15000)

            # Take a screenshot
            screenshot_path = 'jules-scratch/verification/summary_verification.png'
            await popup_page.screenshot(path=screenshot_path)
            print(f"Screenshot saved to {screenshot_path}")

        finally:
            await browser_context.close()

if __name__ == '__main__':
    asyncio.run(main())
"""
One-time setup script: discover each dining hall's FoodPro locationNum.

Run it whenever UCSC adds/renames a location, then paste the printed block into
LOCATIONS in app/config.py.

    python -m scripts.discover_locations

It opens the landing page, follows every location link the way a person would,
and reads locationNum back off the resulting shortmenu.aspx URL - so the values
are confirmed against the page the site actually serves, not guessed from the
href alone.
"""

import asyncio
import re
import sys
import urllib.parse

from playwright.async_api import async_playwright

sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.dirname(__import__("os").path.abspath(__file__))))

from app import config  # noqa: E402


def slugify(name: str) -> str:
    text = name.lower()
    text = text.replace("&", " ").replace("'", "")
    text = re.sub(r"\b(dining hall|dining|hall)\b", " ", text)
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


async def main() -> None:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=config.HEADLESS)
        context = await browser.new_context(user_agent=config.USER_AGENT)
        page = await context.new_page()

        await page.goto(config.FOODPRO_BASE_URL, wait_until="domcontentloaded")

        links = page.locator('a[href*="shortmenu.aspx"]')
        names = [(await links.nth(i).inner_text()).strip() for i in range(await links.count())]
        print(f"Found {len(names)} locations on {config.FOODPRO_BASE_URL}\n")

        discovered = []
        for name in names:
            # Re-find the link each pass: clicking navigates away from the list.
            await page.goto(config.FOODPRO_BASE_URL, wait_until="domcontentloaded")
            await page.get_by_role("link", name=name, exact=True).first.click()
            await page.wait_for_load_state("domcontentloaded")

            query = urllib.parse.parse_qs(urllib.parse.urlparse(page.url).query)
            num = (query.get("locationNum") or ["?"])[0]
            real_name = (query.get("locationName") or [name])[0]

            meals = sorted(set(re.findall(r"mealName=([A-Za-z]+)", await page.content())))

            # Classify off the name, not off published meals: a dining hall that
            # is closed between quarters publishes no meals but is still a
            # dining hall. "meals" is printed for information only.
            is_hall = "dining hall" in real_name.lower()

            status = "dining hall" if is_hall else "cafe/market"
            print(f"  {num:>3}  {real_name:<45} {status:<12} meals={meals or '(none published)'}")
            discovered.append((slugify(real_name), num, real_name, is_hall))
            await asyncio.sleep(config.REQUEST_DELAY_SECONDS)

        await browser.close()

    print("\n" + "=" * 78)
    print("Paste into LOCATIONS in app/config.py:\n")
    print("LOCATIONS = {")
    for slug, num, name, is_hall in discovered:
        print(f'    "{slug}":{" " * max(1, 28 - len(slug))}("{num}", "{name}", {is_hall}),')
    print("}")


if __name__ == "__main__":
    asyncio.run(main())

import os
import json
import time
import requests
import feedparser
import google.generativeai as genai
from bs4 import BeautifulSoup
from datetime import datetime
import traceback

# Configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
OUTPUT_FILE = "public/data/epaper_data.json"

# Configure Gemini
model = None
if GEMINI_API_KEY:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-1.5-flash')
    except Exception as e:
        print(f"Error configuring Gemini: {e}")
else:
    print("WARNING: GEMINI_API_KEY not found. Summarization will be skipped.")

def clean_text(text):
    if not text:
        return ""
    return text.strip().replace('\n', ' ').replace('  ', ' ')

def summarize_section(source_name, section_name, articles):
    """
    Summarizes a list of articles using Gemini.
    Returns a dictionary with 'summary' (English) and optionally 'summary_ta' (Tamil),
    or 'error' if something goes wrong.
    """
    if not model:
        return {"error": "API Key Missing"}
    if not articles:
        return {"error": "No articles to summarize"}

    # Prepare the prompt
    article_list = "\n".join([f"- {a['title']}" for a in articles[:15]])
    is_tamil_source = source_name in ["DINAMANI", "DAILY_THANTHI"]

    base_prompt = f"""
    You are a professional news editor. Summarize the following news headlines from {source_name} - {section_name} into a concise, insightful daily briefing.

    Headlines:
    {article_list}
    """

    if is_tamil_source:
        prompt = base_prompt + """

        REQUIREMENTS:
        1. Provide the summary in TWO languages: English and Tamil.
        2. Format: 3-4 bullet points highlighting the most important stories.
        3. Style: Professional, objective, and journalistic.
        4. SEPARATE the English summary and Tamil summary with the exact delimiter "|||".

        OUTPUT FORMAT:
        <English Summary>
        |||
        <Tamil Summary>
        """
    else:
        prompt = base_prompt + """

        REQUIREMENTS:
        1. Language: English ONLY. (Translate if source is not English).
        2. Format: 3-4 bullet points highlighting the most important stories.
        3. Style: Professional, objective, and journalistic.
        4. No introductory text.
        """

    try:
        response = model.generate_content(prompt)
        text = response.text.strip()

        if is_tamil_source and "|||" in text:
            parts = text.split("|||")
            return {
                "summary": parts[0].strip(),
                "summary_ta": parts[1].strip()
            }

        return {"summary": text}

    except Exception as e:
        print(f"Error summarizing {source_name} - {section_name}: {e}")
        error_msg = str(e)
        if "429" in error_msg:
            return {"error": "Quota Exceeded"}
        elif "403" in error_msg:
            return {"error": "Invalid API Key"}
        else:
            return {"error": "Generation Failed"}

def translate_titles_batch(articles):
    """
    Translates a list of article titles from Tamil to English in one batch.
    Updates the articles list in-place with 'title_en'.
    """
    if not model or not articles:
        return

    titles = [a['title'] for a in articles]
    titles_text = "\n".join([f"{i+1}. {t}" for i, t in enumerate(titles)])

    prompt = f"""
    Translate the following Tamil news headlines to English.
    Maintain the original meaning and journalistic style.
    Return ONLY the translated titles, one per line, numbered exactly as input.

    Headlines:
    {titles_text}
    """

    try:
        response = model.generate_content(prompt)
        translated_lines = response.text.strip().split('\n')

        # Parse and assign
        t_map = {}
        for line in translated_lines:
            parts = line.split('.', 1)
            if len(parts) == 2:
                try:
                    idx = int(parts[0].strip()) - 1
                    text = parts[1].strip()
                    if 0 <= idx < len(articles):
                        articles[idx]['title_en'] = text
                except ValueError:
                    continue

    except Exception as e:
        print(f"Error translating titles: {e}")

# ---------------------------------------------------------------------------
# Scrapers
# ---------------------------------------------------------------------------

def fetch_the_hindu():
    print("Fetching The Hindu (Scraping)...")
    url = "https://www.thehindu.com/todays-paper/"
    sections = []

    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'}
        response = requests.get(url, headers=headers, timeout=30)
        soup = BeautifulSoup(response.content, 'html.parser')

        current_section = {"page": "Front Page", "articles": []}
        sections.append(current_section)

        # Hindu structure analysis
        elements = soup.select('.element, .story-card, .article, .story-card-news')
        last_page = ""

        for el in elements:
            title_el = el.select_one('h3.title a, .story-card-news a, .headline a')
            page_el = el.select_one('.page-num, .page-no')

            if title_el:
                title = clean_text(title_el.get_text())
                link = title_el['href']
                if not link.startswith('http'):
                    link = "https://www.thehindu.com" + link

                if page_el:
                    page_num = clean_text(page_el.get_text())
                    if page_num and page_num != last_page:
                        if current_section["articles"]:
                            current_section = {"page": f"Page {page_num}", "articles": []}
                            sections.append(current_section)
                        last_page = page_num

                if title and link and not any(a['link'] == link for a in current_section['articles']):
                    current_section['articles'].append({"title": title, "link": link})

        # Fallback to RSS if scraping yielded nothing
        if len(sections) == 1 and not sections[0]["articles"]:
            print("The Hindu scraping empty, falling back to RSS...")
            return fetch_rss_fallback("https://www.thehindu.com/news/national/feeder/default.rss", "National")

    except Exception as e:
        print(f"Failed to fetch The Hindu: {e}")
        return fetch_rss_fallback("https://www.thehindu.com/news/national/feeder/default.rss", "National")

    return [s for s in sections if s['articles']]

def fetch_indian_express():
    print("Fetching Indian Express (RSS)...")
    # Using Section Feeds to simulate Pages
    feeds = [
        {"page": "Front Page", "url": "https://indianexpress.com/feed/"},
        {"page": "India", "url": "https://indianexpress.com/section/india/feed/"},
        {"page": "World", "url": "https://indianexpress.com/section/world/feed/"},
        {"page": "Editorial", "url": "https://indianexpress.com/section/opinion/editorials/feed/"}
    ]
    return fetch_from_feeds(feeds)

def fetch_dinamani():
    print("Fetching Dinamani (Google News RSS)...")
    # Using Google News site search to bypass scraping blocks
    feeds = [
        {"page": "Latest News", "url": "https://news.google.com/rss/search?q=site:dinamani.com+when:1d&hl=ta&gl=IN&ceid=IN:ta"},
        {"page": "Tamil Nadu", "url": "https://news.google.com/rss/search?q=site:dinamani.com+Tamil+Nadu+when:1d&hl=ta&gl=IN&ceid=IN:ta"}
    ]
    return fetch_from_feeds(feeds)

def fetch_daily_thanthi():
    print("Fetching Daily Thanthi (Google News RSS)...")
    feeds = [
        {"page": "Latest News", "url": "https://news.google.com/rss/search?q=site:dailythanthi.com+when:1d&hl=ta&gl=IN&ceid=IN:ta"},
        {"page": "Cinema", "url": "https://news.google.com/rss/search?q=site:dailythanthi.com+cinema+when:1d&hl=ta&gl=IN&ceid=IN:ta"}
    ]
    return fetch_from_feeds(feeds)

# Helper for generic RSS fetching
def fetch_from_feeds(feed_list):
    sections = []
    for f in feed_list:
        try:
            d = feedparser.parse(f['url'])
            articles = []
            for entry in d.entries[:15]:
                articles.append({
                    "title": entry.title,
                    "link": entry.link
                })
            if articles:
                sections.append({"page": f['page'], "articles": articles})
        except Exception as e:
            print(f"Error fetching feed {f['url']}: {e}")
    return sections

def fetch_rss_fallback(url, page_name):
    d = feedparser.parse(url)
    articles = [{"title": e.title, "link": e.link} for e in d.entries[:20]]
    if articles:
        return [{"page": page_name, "articles": articles}]
    return []

# ---------------------------------------------------------------------------
# Main Workflow
# ---------------------------------------------------------------------------

def main():
    print("Starting Daily Brief Aggregation...")

    data = {
        "lastUpdated": datetime.now().isoformat(),
        "sources": {}
    }

    sources = {
        "THE_HINDU": fetch_the_hindu,
        "INDIAN_EXPRESS": fetch_indian_express,
        "DINAMANI": fetch_dinamani,
        "DAILY_THANTHI": fetch_daily_thanthi
    }

    for key, fetch_func in sources.items():
        try:
            sections = fetch_func()
            if not sections:
                print(f"Warning: No sections found for {key}")

            print(f"Processing {key}...")
            is_tamil_source = key in ["DINAMANI", "DAILY_THANTHI"]

            for section in sections:
                # 1. Summarize
                time.sleep(1) # Rate limit protection
                result = summarize_section(key, section['page'], section['articles'])

                if result:
                    if 'error' in result:
                        section['error'] = result['error']
                    else:
                        section['summary'] = result.get('summary')
                        if 'summary_ta' in result:
                            section['summary_ta'] = result.get('summary_ta')

                # 2. Translate Titles (if Tamil)
                if is_tamil_source and model:
                    try:
                        time.sleep(1)
                        translate_titles_batch(section['articles'])
                    except Exception as e:
                        print(f"Translation failed for {key}: {e}")

            data["sources"][key] = sections

        except Exception as e:
            print(f"Critical error processing {key}: {e}")
            traceback.print_exc()
            data["sources"][key] = []

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Done! Data saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()

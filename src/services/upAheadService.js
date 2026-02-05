import { proxyManager } from './proxyManager.js';

// Configuration for search queries based on categories
const CATEGORY_QUERIES = {
    movies: [
        'movie tickets booking',
        'showtimes near me',
        'movie releases this friday',
        'cinema listings',
        'upcoming movies'
    ],
    events: [
        'live concert tickets',
        'standup comedy show',
        'music festival line up',
        'upcoming workshops',
        'events happening this weekend',
        'things to do'
    ],
    festivals: [
        'upcoming festivals india',
        'bank holidays upcoming',
        'public holidays list',
        'religious festivals this month'
    ],
    alerts: [
        'traffic advisory',
        'heavy rain alert',
        'power shutdown scheduled',
        'metro rail maintenance',
        'road closure update'
    ],
    sports: [
        'cricket match schedule upcoming',
        'football match upcoming',
        'sports events this week'
    ]
};

// Standard RSS feeds to supplement search queries
const STATIC_FEEDS = {
    movies: [
        "https://www.hindustantimes.com/feeds/rss/entertainment/tamil-cinema/rssfeed.xml",
        "https://www.hindustantimes.com/feeds/rss/entertainment/bollywood/rssfeed.xml"
    ],
    sports: [
        "https://www.espn.com/espn/rss/news"
    ],
    festivals: [
        "https://www.timeanddate.com/holidays/india/feed" // Note: Might need proxy
    ]
};

/**
 * Main function to fetch Up Ahead data based on user settings
 * @param {Object} settings - { categories: { movies: true... }, locations: ['Chennai', 'Muscat'], hideOlderThanHours: 60 }
 */
export async function fetchUpAheadData(settings) {
    console.log('[UpAheadService] Fetching data with settings:', settings);

    const categories = settings?.categories || { movies: true, events: true, festivals: true, alerts: true, sports: true };
    const locations = settings?.locations && settings.locations.length > 0 ? settings.locations : ['Chennai', 'India']; // Default fallback

    let allItems = [];

    // 1. Build list of RSS/Search URLs
    const urlsToFetch = [];

    // Helper to add Google News Search URL
    const addSearchUrl = (query) => {
        const encoded = encodeURIComponent(query);
        // Using "when:7d" to ensure freshness
        urlsToFetch.push({
            url: `https://news.google.com/rss/search?q=${encoded}+when:7d&hl=en-IN&gl=IN&ceid=IN:en`,
            type: 'search',
            originalQuery: query
        });
    };

    // Iterate categories and locations
    for (const [cat, isEnabled] of Object.entries(categories)) {
        if (!isEnabled) continue;

        // A. Add Static Feeds for this category (if any)
        if (STATIC_FEEDS[cat]) {
            STATIC_FEEDS[cat].forEach(url => {
                urlsToFetch.push({ url, type: 'static', category: cat });
            });
        }

        // B. Add Search Queries (combined with locations for relevance)
        const queries = CATEGORY_QUERIES[cat] || [];
        queries.forEach(baseQuery => {
            // Add location-specific queries (e.g., "events happening this week Chennai")
            if (cat === 'events' || cat === 'alerts' || cat === 'movies') {
                locations.forEach(loc => {
                    // Skip "India" for hyper-local categories to avoid noise (e.g. "Traffic Advisory India" -> fetches Thane/Mumbai news)
                    if (loc.toLowerCase() === 'india' && (cat === 'alerts' || cat === 'events')) {
                        return;
                    }
                    addSearchUrl(`${baseQuery} ${loc}`);
                });
            } else {
                 // For sports/festivals, location might be less strict or handled by "India"
                 addSearchUrl(`${baseQuery}`);
            }
        });
    }

    // Deduplicate URLs
    const uniqueUrls = [...new Map(urlsToFetch.map(item => [item.url, item])).values()];

    console.log(`[UpAheadService] Prepared ${uniqueUrls.length} feeds to fetch.`);

    // 2. Fetch All Feeds in Parallel
    const fetchPromises = uniqueUrls.map(async (feedConfig) => {
        try {
            // Using proxyManager directly to get raw items, then processing
            const { items } = await proxyManager.fetchViaProxy(feedConfig.url);

            // Map items to our structure immediately
            return items.map(item => normalizeUpAheadItem(item, feedConfig));
        } catch (error) {
            console.warn(`[UpAheadService] Failed to fetch ${feedConfig.url}:`, error.message);
            return [];
        }
    });

    const results = await Promise.all(fetchPromises);
    allItems = results.flat();

    // 3. Process, Deduplicate, and Organize
    const organizedData = processUpAheadData(allItems, settings);

    return organizedData;
}

/**
 * Normalizes an RSS item into an Up Ahead item
 */
function stripHtml(html) {
    if (!html) return "";
    let text = html.toString();

    // Decode common entities first
    const entities = {
        '&nbsp;': ' ',
        '&amp;': '&',
        '&quot;': '"',
        '&#39;': "'",
        '&lt;': '<',
        '&gt;': '>'
    };

    text = text.replace(/&[a-z0-9#]+;/gi, (match) => entities[match] || match);

    // Remove scripts and styles
    text = text.replace(/<script[^>]*>([\S\s]*?)<\/script>/gmi, "");
    text = text.replace(/<style[^>]*>([\S\s]*?)<\/style>/gmi, "");

    // Remove all HTML tags
    text = text.replace(/<\/?[^>]+(>|$)/g, "");

    return text.trim();
}

export function normalizeUpAheadItem(item, config) {
    const title = stripHtml(item.title || '');
    const description = stripHtml(item.description || '');
    const fullText = `${title} ${description}`;
    const pubDate = item.pubDate ? new Date(item.pubDate) : null;

    // Attempt to extract a date, using pubDate as context
    const extractedDate = extractFutureDate(fullText, pubDate);

    // Determine Category (if not already known from config)
    let category = config.category;
    if (!category || config.type === 'search') {
        category = detectCategory(fullText);
    }

    return {
        id: item.guid || item.link || title,
        title: title,
        link: item.link,
        description: description,
        pubDate: pubDate, // Store as Date object or null
        extractedDate: extractedDate, // This is the crucial "Event Date"
        category: category,
        rawSource: config.originalQuery || 'feed'
    };
}

/**
 * Regex-based Category Detection
 */
export function detectCategory(text) {
    const t = text.toLowerCase();
    if (t.includes('movie') || t.includes('release') || t.includes('trailer') || t.includes('film') || t.includes('cinema') || t.includes('ott')) return 'movies';
    if (t.includes('cricket') || t.includes('match') || t.includes('football') || t.includes('tournament') || t.includes('vs')) return 'sports';
    if (t.includes('festival') || t.includes('holiday') || t.includes('jayanti') || t.includes('puja')) return 'festivals';
    if (t.includes('alert') || t.includes('warning') || t.includes('heavy rain') || t.includes('traffic') || t.includes('shut')) return 'alerts';
    if (t.includes('concert') || t.includes('exhibition') || t.includes('show') || t.includes('workshop')) return 'events';
    return 'general';
}

/**
 * Intelligent Date Extraction
 * Looks for patterns like "Oct 20", "Next Friday", "Tomorrow", etc.
 * @param {string} text - The text to search for dates
 * @param {Date|null} pubDate - The publication date of the article (for year context)
 */
export function extractFutureDate(text, pubDate) {
    // 1. Check for explicit dates e.g., "October 25", "25th Oct", "Oct 25, 2024"
    // Regex for Month Day pairs, optionally with Year
    const months = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december';

    // Pattern: "October 25" or "October 25, 2025"
    const dateRegex = new RegExp(`\\b(${months})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i');

    // Pattern: "25th October" or "25 October 2025"
    const reverseDateRegex = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${months})(?:,?\\s+(\\d{4}))?\\b`, 'i');

    let match = text.match(dateRegex);
    let day, monthStr, explicitYear;

    if (match) {
        monthStr = match[1];
        day = parseInt(match[2]);
        if (match[3]) explicitYear = parseInt(match[3]);
    } else {
        match = text.match(reverseDateRegex);
        if (match) {
            day = parseInt(match[1]);
            monthStr = match[2];
            if (match[3]) explicitYear = parseInt(match[3]);
        }
    }

    if (day && monthStr) {
        // Contextualize the year
        const now = new Date();
        const monthIndex = new Date(`${monthStr} 1, 2000`).getMonth();
        let year;

        if (explicitYear) {
            // Use the explicit year found in the text
            year = explicitYear;
        } else {
            year = now.getFullYear();

            // If pubDate is available, use its year as the primary anchor
            if (pubDate && !isNaN(pubDate.getTime())) {
                year = pubDate.getFullYear();

                // Handle edge case: Article in Dec talking about Jan (Next Year)
                const eventMonthIsEarlier = monthIndex < pubDate.getMonth();
                if (eventMonthIsEarlier && (pubDate.getMonth() - monthIndex) > 6) {
                    year = year + 1;
                }
            } else {
                 // Fallback: if extracted date is "far past" relative to now, assume next year.
                 const currentMonth = now.getMonth();
                 if (monthIndex < currentMonth && (currentMonth - monthIndex) > 3) {
                     year = year + 1;
                 }
            }
        }

        return new Date(year, monthIndex, day);
    }

    // 2. Relative Dates: "Tomorrow", "This Friday"
    const lower = text.toLowerCase();

    // Use pubDate as "today" reference if available, otherwise real Today
    const refDate = (pubDate && !isNaN(pubDate.getTime())) ? pubDate : new Date();

    if (lower.includes('tomorrow')) {
        const d = new Date(refDate);
        d.setDate(refDate.getDate() + 1);
        return d;
    }

    return null;
}


/**
 * Processing Logic to create the final JSON structure
 */
export function processUpAheadData(rawItems, settings) {
    const today = new Date();
    today.setHours(0,0,0,0);

    const timelineMap = new Map(); // Key: "YYYY-MM-DD", Value: { dateObj, items: [] }
    const sections = {
        movies: [],
        festivals: [],
        alerts: [],
        events: [],
        sports: []
    };

    const seenIds = new Set();

    // Default max age: 60 hours (2.5 days)
    const maxAgeHours = settings?.hideOlderThanHours || 60;
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

    rawItems.forEach(item => {
        if (seenIds.has(item.id)) return;
        seenIds.add(item.id);

        // Strict Freshness Check
        if (item.pubDate) {
            const ageMs = Date.now() - item.pubDate.getTime();
            if (ageMs > maxAgeMs) {
                return;
            }
        }

        const fullText = (item.title + " " + item.description).toLowerCase();

        // --- KEYWORD FILTERING (Phase 9) ---
        const keywords = settings?.upAhead?.keywords || {};

        // 1. Negative Filtering (Global)
        const negativeWords = keywords.negative || ["review", "interview", "shares", "gossip", "opinion", "reaction"];
        if (negativeWords.some(w => fullText.includes(w.toLowerCase()))) {
            return; // Drop item
        }

        // 2. Positive Filtering (Category Specific)
        if (['movies', 'events'].includes(item.category)) {
            const positiveWords = keywords[item.category]; // e.g. ["tickets", "showtimes"]
            if (positiveWords && positiveWords.length > 0) {
                // If user defined positive keywords, require at least one match?
                // Or just boost? The user said "Focus on...", which implies strictness or strong ranking.
                // Let's implement strictness for now as requested to "remove generic news".
                const hasMatch = positiveWords.some(w => fullText.includes(w.toLowerCase()));
                if (!hasMatch) return; // Drop if it doesn't match focus keywords
            }
        }

        // 3. Strict Location for Alerts
        if (item.category === 'alerts') {
            const userLocations = settings?.upAhead?.locations || ['Chennai', 'Muscat', 'Trichy'];
            const hasLocation = userLocations.some(loc => fullText.includes(loc.toLowerCase()));
            if (!hasLocation) {
                return; // Drop alerts not mentioning user's specific locations
            }
        }

        // Populate Sections
        if (item.category && sections[item.category]) {
            // STRICT FILTER: For planner sections (Movies, Festivals, Events, Sports),
            // we REQUIRE a valid extracted date.
            // Alerts are exempt as they often imply "Immediate/Now" without explicit dates.
            const isPlannerCategory = ['movies', 'festivals', 'events', 'sports'].includes(item.category);

            if (isPlannerCategory && !item.extractedDate) {
                // Skip generic news items that don't have a specific date (e.g. opinion pieces, rumors)
                return;
            }

            // Simplify item for display
            const displayItem = {
                title: item.title,
                link: item.link,
                releaseDate: item.extractedDate ? item.extractedDate.toDateString() : null, // For movies
                date: item.extractedDate ? item.extractedDate.toDateString() : null, // For festivals
                text: item.title, // For alerts
                severity: 'medium', // Default
                language: 'Unknown' // Placeholder
            };
            sections[item.category].push(displayItem);
        }

        // Populate Timeline
        let targetDate = item.extractedDate;

        // If no date, but it's an alert or very recent news, put in Today
        if (!targetDate && item.category === 'alerts') {
             // Only if very fresh (< 24h)
             if (item.pubDate && (Date.now() - item.pubDate.getTime() < 24 * 60 * 60 * 1000)) {
                 targetDate = today;
             }
        }

        // Only add to timeline if targetDate is >= Today
        if (targetDate && targetDate >= today) {
            const dateKey = targetDate.toISOString().split('T')[0];

            if (!timelineMap.has(dateKey)) {
                timelineMap.set(dateKey, {
                    date: dateKey,
                    dayLabel: getDayLabel(targetDate),
                    items: []
                });
            }

            const timelineItem = {
                id: item.id,
                type: getItemType(item.category), // "movie", "alert", etc.
                title: item.title,
                subtitle: item.category.toUpperCase(),
                description: item.description,
                tags: [item.category],
                link: item.link
            };

            timelineMap.get(dateKey).items.push(timelineItem);
        }
    });

    // Sort Timeline by Date
    const sortedTimeline = Array.from(timelineMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Limit sections length
    Object.keys(sections).forEach(k => {
        sections[k] = sections[k].slice(0, 5);
    });

    // Generate Mock Weekly Plan if empty (or heuristic based)
    const weekly_plan = generateWeeklyPlan(sortedTimeline);

    return {
        timeline: sortedTimeline,
        sections: sections,
        weekly_plan: weekly_plan,
        lastUpdated: new Date().toISOString()
    };
}

function getDayLabel(date) {
    const today = new Date();
    today.setHours(0,0,0,0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const d = new Date(date);
    d.setHours(0,0,0,0);

    if (d.getTime() === today.getTime()) return "Today";
    if (d.getTime() === tomorrow.getTime()) return "Tomorrow";

    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function getItemType(category) {
    // map plural categories to singular types expected by UI
    const map = {
        movies: 'movie',
        events: 'event',
        festivals: 'festival',
        alerts: 'alert',
        sports: 'sport'
    };
    return map[category] || 'event';
}

function generateWeeklyPlan(timeline) {
    // Generate plan for the next 7 days from today
    const plan = {};
    const today = new Date();

    // Create list of next 7 days
    const next7Days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        next7Days.push(d);
    }

    next7Days.forEach(dateObj => {
        const dateStr = dateObj.toISOString().split('T')[0];
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });

        // Find events for this date
        const timelineDay = timeline.find(t => t.date === dateStr);

        if (timelineDay && timelineDay.items.length > 0) {
            // Use the first event title, strip "Attend " if present (though we removed it)
            // Just use title directly
            plan[dayName] = timelineDay.items[0].title;
        } else {
            // Rotating placeholder text for variety
            const placeholders = [
                "Relax and recharge.",
                "Nothing scheduled yet.",
                "Free day.",
                "Good time for a hobby.",
                "Catch up on reading."
            ];
            plan[dayName] = placeholders[dateObj.getDay() % placeholders.length];
        }
    });

    return plan;
}

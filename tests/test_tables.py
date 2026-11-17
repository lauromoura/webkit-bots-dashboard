"""Builder tables (Bot Watcher, gardening): order, placeholders, failures."""

import re

import pytest

from synthetic import build, builds_response, fulfill_json

# Every table's builder names, its placeholder rows and its section title.
TABLES_JS = """() => [...document.querySelectorAll('table')].map(t => ({
    section: (t.closest('details')?.querySelector('summary')?.innerText
              || t.previousElementSibling?.innerText || '').trim(),
    names: [...t.querySelectorAll('tbody td.builderName')].map(td => td.innerText.trim()),
    placeholders: [...t.querySelectorAll('tbody tr.placeholder-row')].map(r =>
        r.querySelector('.builderName').innerText.trim() + ': ' +
        r.querySelector('.currentBuild').innerText.trim()),
}))"""

# getLastBuilds() asks for the latest build first ("probe"); match per builder.
PROBE = r".*/api/v2/builders/%d/builds\?order=-number&limit=2$"
RELEASE_BUILD = ("WPE-Linux-64-bit-Release-Build", 6)


def wait_rows_loaded(page):
    """Wait until no builder-table row is still showing 'loading…'."""
    page.wait_for_function(
        "() => ![...document.querySelectorAll('tr.placeholder-row .currentBuild')]"
        ".some(c => c.textContent.includes('loading'))", timeout=120000)
    page.wait_for_timeout(200)


def is_alphabetical(names):
    return names == sorted(names, key=str.lower) or names == sorted(names)


@pytest.mark.parametrize("path", ["index.html", "gardening.html"])
def test_tables_render_identically_across_loads(open_page, path):
    shots = []
    for _ in range(2):
        rec = open_page()
        rec.goto(path)
        shots.append(rec.page.screenshot(full_page=True))
    assert shots[0] == shots[1], "%s renders differently between loads" % path


@pytest.mark.parametrize("path", ["index.html", "gardening.html"])
def test_tables_are_alphabetical_and_fully_loaded(open_page, path):
    rec = open_page()
    rec.goto(path)
    tables = [t for t in rec.page.evaluate(TABLES_JS) if t["names"]]
    assert tables
    for t in tables:
        assert is_alphabetical(t["names"]), "%r not alphabetical: %s" % (t["section"], t["names"])
        assert t["placeholders"] == [], "%r still loading: %s" % (t["section"], t["placeholders"])
    assert rec.problems() == []


def test_slow_builder_keeps_its_slot(open_page):
    name, builder_id = RELEASE_BUILD
    rec = open_page()
    released = []

    def hold(route):
        released.append(route)   # answered later, after the first check

    rec.page.route(re.compile(PROBE % builder_id), hold)
    rec.page.goto(rec.base + "/gardening.html")
    rec.page.wait_for_function(
        "() => document.querySelectorAll('table')[1]?.querySelectorAll('tbody tr').length > 0")
    rec.page.wait_for_timeout(500)
    table = rec.page.evaluate(TABLES_JS)[1]
    slot = sorted(table["names"], key=str.lower).index(name)
    assert table["names"][slot] == name
    assert "%s: loading…" % name in table["placeholders"]

    for route in released:
        route.continue_()
    wait_rows_loaded(rec.page)
    table = rec.page.evaluate(TABLES_JS)[1]
    assert table["names"][slot] == name
    assert table["placeholders"] == []


def test_failed_builder_shows_failure_and_table_still_sorts(open_page):
    name, builder_id = RELEASE_BUILD
    rec = open_page()
    rec.page.route(re.compile(PROBE % builder_id), lambda route: route.abort())
    rec.goto("gardening.html")
    table = rec.page.evaluate(TABLES_JS)[1]
    assert "%s: Failed to load" % name in table["placeholders"]
    assert len(table["placeholders"]) == 1
    rec.page.locator("table").nth(1).locator("th").first.click()
    assert rec.page.locator("table").nth(1).locator("th[aria-sort]").count() == 1


@pytest.mark.parametrize("path", ["index.html", "gardening.html"])
def test_collapsed_sections_load_alphabetically(open_page, frozen_time, path):
    """Collapsed sections aren't in the recorded fixtures (they're only fetched
    when opened); answer their builders with synthetic data instead."""
    rec = open_page()
    rec.goto(path)
    eager = {int(m.group(1)) for p in rec.api_paths
             for m in [re.match(r"/api/v2/builders/(\d+)/builds", p)] if m}
    now = int(frozen_time.timestamp())

    def answer(route):
        builder_id = int(re.search(r"/builders/(\d+)/builds", route.request.url).group(1))
        if builder_id in eager:
            route.continue_()
        else:
            fulfill_json(route, builds_response(build(builder_id, now=now)))

    rec.page.route(re.compile(r".*/api/v2/builders/\d+/builds\?.*"), answer)
    summaries = rec.page.locator("details > summary")
    assert summaries.count() > 0
    for i in range(summaries.count()):
        summaries.nth(i).click()
    wait_rows_loaded(rec.page)

    collapsed = [t for t in rec.page.evaluate(TABLES_JS)
                 if t["names"] and rec.page.locator("details table").count()
                 and t["section"] in [s.strip() for s in summaries.all_inner_texts()]]
    assert collapsed, "no collapsed tables found"
    for t in collapsed:
        assert is_alphabetical(t["names"]), "%r not alphabetical" % t["section"]
        assert t["placeholders"] == [], "%r rows not loaded: %s" % (t["section"], t["placeholders"][:3])
    assert rec.problems() == []

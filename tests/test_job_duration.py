"""job-duration.html: builder selection, paging, URL/file loads and load races."""

import json
import os
import re

import pytest

# Buildbot builder ids (stable) for the builders the page offers.
BUILDER_IDS = {
    "WPE-Linux-64-bit-Release-Build": 6,
    "WPE-Linux-64-bit-Debug-Build": 66,
    "WPE-Linux-64-bit-Release-Tests": 40,
    "WPE-Linux-64-bit-Debug-Tests": 14,
    "WPE-Linux-64-bit-Release-JS-Tests": 44,
}
PRESETS = {
    "WPE Release Build": "WPE-Linux-64-bit-Release-Build",
    "WPE Debug Build": "WPE-Linux-64-bit-Debug-Build",
    "WPE Release Tests": "WPE-Linux-64-bit-Release-Tests",
    "WPE Debug Tests": "WPE-Linux-64-bit-Debug-Tests",
}
PAGE_INFO = re.compile(r"Page (\d+) of (\d+) — showing (\d+)-(\d+) of (\d+)")


def state(page):
    rows = page.locator("#tableContainer tbody tr, #tableContainer tr:not(:first-child)")
    first = page.locator("#tableContainer a").first
    return {
        "label": page.text_content("#currentBuilder").strip(),
        "rows": page.locator("#tableContainer tr").count() - 1,
        "first_number": int(first.inner_text()) if first.count() else None,
        "first_link": first.get_attribute("href") if first.count() else None,
        "page_info": page.text_content("#pageInfo").strip(),
        "prev_disabled": page.is_disabled("#prevPageBtn"),
        "next_disabled": page.is_disabled("#nextPageBtn"),
        "x_type": page.evaluate(
            "() => Chart.getChart('durationChart')?.options.scales.x.type ?? null"),
    }


def settle(page):
    """Wait until the page's current load has finished (status no longer 'Loading…')."""
    page.wait_for_function(
        "() => !/^Loading/.test(document.getElementById('statusMessage').textContent.trim())",
        timeout=60000)
    page.wait_for_timeout(200)


def assert_builder_view(s, builder, count, page_number):
    assert s["label"] == builder
    assert s["rows"] == count
    assert "/builders/%d/builds/%d" % (BUILDER_IDS[builder], s["first_number"]) in s["first_link"]
    m = PAGE_INFO.fullmatch(s["page_info"])
    assert m, s["page_info"]
    page, pages, first, last, total = map(int, m.groups())
    assert page == page_number and (first, last) == ((page - 1) * count + 1, page * count)
    # Build numbers are sequential: newest number on page + offset = total.
    assert total == s["first_number"] + (page - 1) * count
    assert s["prev_disabled"] == (page == 1)
    assert s["next_disabled"] == (page >= pages)


def test_controls(open_page, tmp_path):
    rec = open_page()
    page = rec.page
    rec.goto("job-duration.html")
    assert_builder_view(state(page), "WPE-Linux-64-bit-Release-Build", 100, 1)

    for button, builder in PRESETS.items():
        page.get_by_role("button", name=button, exact=True).click()
        settle(page)
        assert_builder_view(state(page), builder, 100, 1)

    page.select_option("#builderSelect", "WPE-Linux-64-bit-Release-JS-Tests")
    settle(page)
    assert_builder_view(state(page), "WPE-Linux-64-bit-Release-JS-Tests", 100, 1)

    page.check("input[name=xaxis][value=buildnumber]")
    assert state(page)["x_type"] == "category"
    page.check("input[name=xaxis][value=timestamp]")
    assert state(page)["x_type"] == "time"

    page.select_option("#jobCountSelect", "25")
    settle(page)
    assert_builder_view(state(page), "WPE-Linux-64-bit-Release-JS-Tests", 25, 1)
    for expected_page, button in [(2, "#nextPageBtn"), (3, "#nextPageBtn"), (2, "#prevPageBtn")]:
        page.click(button)
        settle(page)
        assert_builder_view(state(page), "WPE-Linux-64-bit-Release-JS-Tests", 25, expected_page)

    # Load from URL: data from another builder; label, links and paging follow it.
    page.fill("#urlInput", "/api/v2/builders/WPE-Linux-64-bit-Release-Build/builds"
                           "?limit=100&offset=0&order=-number&property=identifier")
    page.click("#urlInput ~ button")
    settle(page)
    s = state(page)
    assert s["label"] == "Loaded from URL"
    assert "/builders/6/builds/" in s["first_link"]
    assert s["page_info"] == "100 builds (from URL)"
    assert s["prev_disabled"] and s["next_disabled"]

    # Load from file: same checks.
    data = page.evaluate("async () => (await fetch('/api/v2/builders/WPE-Linux-64-bit-Debug-Tests/builds"
                         "?limit=100&offset=0&order=-number&property=identifier')).json()")
    path = tmp_path / "builds.json"
    path.write_text(json.dumps(data))
    page.set_input_files("#fileInput", str(path))
    page.click("#fileInput ~ button")
    settle(page)
    s = state(page)
    assert s["label"] == "Loaded from file (builds.json)"
    assert "/builders/14/builds/" in s["first_link"]
    assert s["page_info"] == "100 builds (from file)"
    assert s["prev_disabled"] and s["next_disabled"]

    # The count selector goes back to the selected builder, page 1.
    page.select_option("#jobCountSelect", "50")
    settle(page)
    assert_builder_view(state(page), "WPE-Linux-64-bit-Release-JS-Tests", 50, 1)
    assert rec.problems() == []


def hold_requests(page, pattern):
    """Hold matching requests until the returned function releases them."""
    held = []
    page.route(re.compile(pattern), lambda route: held.append(route))

    def release():
        for route in held:
            route.continue_()
    return release


def test_late_builder_response_is_dropped(open_page):
    rec = open_page()
    page = rec.page
    rec.goto("job-duration.html")
    release = hold_requests(page, r".*/builders/WPE-Linux-64-bit-Debug-Build/builds.*")
    page.get_by_role("button", name="WPE Debug Build", exact=True).click()
    page.get_by_role("button", name="WPE Release Tests", exact=True).click()
    settle(page)
    release()
    page.wait_for_timeout(1000)   # let the late response arrive (and be dropped)
    assert_builder_view(state(page), "WPE-Linux-64-bit-Release-Tests", 100, 1)
    assert rec.problems() == []


def test_late_page_response_is_dropped(open_page):
    rec = open_page()
    page = rec.page
    rec.goto("job-duration.html")
    page.select_option("#jobCountSelect", "25")
    settle(page)
    release = hold_requests(page, r".*limit=25&offset=25&.*")
    page.click("#nextPageBtn")
    page.select_option("#jobCountSelect", "50")
    settle(page)
    release()
    page.wait_for_timeout(1000)   # let the late response arrive (and be dropped)
    assert_builder_view(state(page), "WPE-Linux-64-bit-Release-Build", 50, 1)
    assert rec.problems() == []

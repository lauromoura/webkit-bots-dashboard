class WKBotApp {
    constructor() {
    }
}

function urlFor(path) {
    const BASE_URL = "https://build.webkit.org/api/v2/";
    const URL_SUFFIX = ""; // TODO Remove? "?as_text=1";
    return BASE_URL + path + URL_SUFFIX;
}

async function getLastNBuilds(builderName, number) {
    Array
    const path = urlFor("builders/" + builderName + "/builds?" + buildNumber);
    console.log("Fetching path: " + path);
    const response = await fetch(path);
    return response.json();
}

function isWPE(builder) {
    return builder.tags.includes("WPE");
}

function isGTK(builder) {
    return builder.tags.includes("GTK");
}

window.addEventListener('load', async e => {
    let builders = urlFor('builders');
    console.log(`Fetching ${builders}`);
    const response = await(fetch(builders));
    if (!response.ok) {
        console.log("Ooops....");
        console.log(response);
        return;
    }

    response.json().then(data => {
        console.log(`Found ${data.meta.total} bots`);
        const wpeBots = data.builders.filter(isWPE).sort(bot => bot.name);
        let buildList = document.getElementById("wpe-builders-list");
        displayBots(wpeBots, buildList);

        const gtkBots = data.builders.filter(isGTK).sort();
        buildList = document.getElementById("gtk-builders-list");
        displayBots(gtkBots, buildList);
    });
});

function displayBots(bots, targetList) {
    for (const builder of bots) {
        console.log(builder);
        targetList.innerHTML += "<li>" + builder.name + "</li>";
    }
}

async function registerSW() {
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('./sw.js');
        } catch (e) {
            alert('ServiceWorker registration failed. Sorry about that.');
        }
    } else {
        document.querySelector('.alert').removeAttribute('hidden');
    }
}

class WKBotApp {
    constructor() {
    }
}

function urlFor(path) {
    const BASE_URL = "https://build.webkit.org/api/v2/";
    const URL_SUFFIX = "";
    return BASE_URL + path + URL_SUFFIX;
}

function urlForBuilder(builderId) {
    return `https://build.webkit.org/#/builders/${builderId}`;
}

function urlForJob(builderId, jobNumber) {
    return `${urlForBuilder(builderId)}/builds/${jobNumber}`
}

async function getLastBuild(builderId) {
    const path = urlFor(`builders/${builderId}/builds?order=-number&limit=6&complete=true`);
    console.log("Fetching path: " + path);
    const response = await fetch(path);
    return response.json().then(data => {
        console.log(data);
        return data;
    });
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
        const wpeBots = data.builders.filter(isWPE).sort((a, b) => a.name > b.name);
        let buildList = document.querySelector("#wpe-builders-list > tbody");
        displayBots(wpeBots, buildList);

        const gtkBots = data.builders.filter(isGTK).sort((a, b) => a.name > b.name);
        buildList = document.querySelector("#gtk-builders-list > tbody");
        displayBots(gtkBots, buildList);
    });
});

function displayBots(bots, targetList) {
    for (const builder of bots) {
        console.log(builder);
        let template = document.getElementById("builderListEntry");
        let clone = template.content.firstElementChild.cloneNode(true);
        {
            let name = clone.querySelector(".builderName");
            name.innerHTML = `<a href="./builder.html?${builder.builderid}">${builder.name}</a>`;
        }

        displayLastBuild(builder.builderid, clone);

        let externalLink = clone.querySelector(".externalLink");
        externalLink.innerHTML += `<a href="${urlForBuilder(builder.builderid)}">External link</a>`
        targetList.appendChild(clone);
    }
}

function createLinkForJob(builderId, jobNumber, text) {
    let link = document.createElement("a");
    link.setAttribute("href", urlForJob(builderId, jobNumber));
    link.textContent = text;
    return link;
}

function displayLastBuild(builderId, target) {
    // console.log(`Getting status of builderid ${builderId}`);
    getLastBuild(builderId).then(data => {
        // console.log(`Got results for builderid ${builderId}`)
        if (data === undefined) {
            // console.log("NO DATA!!!!!")
            return;
        }
        // console.log(data);
        // console.log(data["builds"]);
        let build = data.builds.shift();

        {
            let cell = target.querySelector(".lastBuildNumber");
            let state = `(Build #${build.number} )`;
            let link = createLinkForJob(builderId, build.number, state);
            cell.appendChild(link);
        }

        {
            let cell = target.querySelector(".builderStatus");
            cell.textContent = `${build.state_string}`;
            if (build.state_string == "build successful") {
                cell.className += " success";
            } else {
                cell.className += " failure";
            }
        }

        {
            let cell = target.querySelector(".buildTime");
            let date = new Date(0);
            date.setUTCSeconds(build.complete_at);
            // console.log(date);
            cell.textContent = formatRelativeDate(build.complete_at);
        }

        {
            let cell = target.querySelector(".otherBuilds");
            let ul = document.createElement("ul");
            for (const build of data.builds) {
                let li = document.createElement("li");
                let link = document.createElement("a");
                link.setAttribute("href", urlForJob(builderId, build.number));
                link.textContent = `${build.number}`;
                li.appendChild(link);
                if (build.state_string == "build successful") {
                    li.classList.add("success");
                } else {
                    li.classList.add("failure");
                }
                ul.appendChild(li);
            }
            cell.appendChild(ul);
        }
    });

    function formatRelativeDate(epoch) {
        let ret = '';
        let now = new Date();
        let utcSecondsSinceEpoch = Math.round(now.getTime() / 1000);
        let distance =utcSecondsSinceEpoch - epoch;

        // FIXME replace with some lib?
        let day_div = 3600 * 24;
        let days = Math.floor(distance / day_div);
        let remainder = distance % day_div;

        if (days > 0) {
            ret += `${days} days `;
        }

        let hour_div = 3600;
        let hours = Math.floor(remainder / hour_div);
        remainder = remainder % hour_div;

        let minute_div = 60;
        let minutes = Math.floor(remainder / minute_div);
        remainder = remainder % minute_div;

        let seconds = remainder;

        let n = function(arg) {
            return `${arg}`.padStart(2, '0');
        }

        return  ret + `${n(hours)}h ${n(minutes)}m ${n(seconds)}s ago`;
    }
}

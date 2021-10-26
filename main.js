import * as utils from "./modules/utils.js";

window.addEventListener('load', async e => {
    let builders = utils.urlFor('builders');
    console.log(`Fetching ${builders}`);
    const response = await(fetch(builders));
    if (!response.ok) {
        console.log("Ooops....");
        console.log(response);
        return;
    }

    response.json().then(data => {
        console.log(`Found ${data.meta.total} bots`);
        const wpeBots = data.builders.filter(utils.isWPE).sort((a, b) => a.name > b.name);
        let buildList = document.querySelector("#wpe-builders-list > tbody");
        displayBots(wpeBots, buildList);

        const gtkBots = data.builders.filter(utils.isGTK).sort((a, b) => a.name > b.name);
        buildList = document.querySelector("#gtk-builders-list > tbody");
        displayBots(gtkBots, buildList);
    });

    {
        let timestamp_span = document.getElementById("timestamp");
        let timestamp = new Date();
        timestamp_span.textContent = timestamp.toString();
    }
});

function displayBots(bots, targetList) {
    for (const builder of bots) {
        console.log(builder);
        let template = document.getElementById("builderListEntry");
        let clone = template.content.firstElementChild.cloneNode(true);
        {
            let name = clone.querySelector(".builderName");
            name.innerHTML = `<a href="./builder.html?builder=${builder.builderid}">${builder.name}</a>`;
        }

        displayLastBuild(builder.builderid, clone);

        let externalLink = clone.querySelector(".externalLink");
        externalLink.innerHTML += `<a href="${utils.urlForBuilder(builder.builderid)}">External link</a>`
        targetList.appendChild(clone);
    }
}

function displayLastBuild(builderId, target) {
    utils.getLastBuild(builderId, 6).then(data => {
        if (data === undefined)
            return;

        let build = data.builds.shift();

        {
            let cell = target.querySelector(".currentBuild");
            if (build.complete) {
                cell.innerHTML += "Waiting for jobs";
            } else {
                cell.classList.add("building");
                let build_number_text = `(Build #${build.number})`;
                let link = utils.createLinkForJob(builderId, build.number, build_number_text);
                cell.appendChild(link);

                let status_span = document.createElement("span");
                status_span.textContent = ` ${build.state_string}`;
                cell.appendChild(status_span);

                build = data.builds.shift();
            }
        }

        {
            let cell = target.querySelector(".lastBuild");

            let build_number_text = `(Build #${build.number})`;
            let link = utils.createLinkForJob(builderId, build.number, build_number_text);
            link.style.float = "left";
            link.style.width = "30%";
            cell.appendChild(link);

            if (build.state_string == "build successful") {
                cell.className += " success";
            } else {
                cell.className += " failure";
            }
            let status_span = document.createElement("span");
            status_span.textContent = build.state_string;
            cell.appendChild(status_span);
        }

        {
            let cell = target.querySelector(".buildTime");
            let date = new Date(0);
            date.setUTCSeconds(build.complete_at);
            let date_str = utils.formatRelativeDateFromNow(build.complete_at);

            cell.textContent = date_str;
        }

        {
            let cell = target.querySelector(".otherBuilds");
            let ul = document.createElement("ul");
            for (const build of data.builds) {
                let li = document.createElement("li");
                let link = document.createElement("a");
                link.setAttribute("href", utils.urlForJob(builderId, build.number));
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
}

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

        const configurations = [
            {
                tableSelector: "#release-builders-list > tbody",
                condition: utils.isTier1,
                bots: [],
            },
            {
                tableSelector: "#release-testers-list > tbody",
                condition: utils.isTier2,
                bots: [],
            },
            {
                tableSelector: "#debug-builders-list > tbody",
                condition: utils.isTier3,
                bots: [],
            },
            {
                tableSelector: "#stable-builders-list > tbody",
                condition: utils.isTier5,
                bots: [],
            },
            {
                tableSelector: "#low-priority-list > tbody",
                condition: utils.isLowTier,
                bots: [],
            },
        ];

        for (const builder of data.builders) {
            for (const configuration of configurations) {
                if (configuration.condition(builder)) {
                    configuration.bots.push(builder);
                }
            }
        }

        for (const configuration of configurations) {
            let buildList = document.querySelector(configuration.tableSelector);
            displayBots(configuration.bots, buildList);
        }

        // time limit
        let wpeTimeLimitTable = document.querySelector("#wpe-release-tester-timelimit-list > tbody")
        let wpeReleaseBot = data.builders.find((bot) => {
            return utils.isWPE(bot) && utils.isTier2(bot);
        });
        displayTimeLimit(wpeReleaseBot, wpeTimeLimitTable);

        let gtkTimeLimitTable = document.querySelector("#gtk-release-tester-timelimit-list > tbody")
        let gtkReleaseBot = data.builders.find((bot) => {
            return utils.isGTK(bot) && utils.isTier2(bot) && !utils.isSkipFailing(bot);
        });
        displayTimeLimit(gtkReleaseBot, gtkTimeLimitTable);


        return;
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

        if (build === undefined)
            return;

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
            let date_str = utils.formatRelativeDateFromNow(build.complete_at);

            let duration_str = utils.formatRelativeDate(build.started_at, build.complete_at, "");
            cell.textContent = `${date_str} (duration: ${duration_str})`;

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

function displayTimeLimit(builder, targetList) {
    utils.getLastBuild(builder.builderid, 5).then(data => {
        for (const build of data.builds) {
            let template = document.getElementById("timeLimitListEntry");
            let clone = template.content.firstElementChild.cloneNode(true);
            {
                let number = clone.querySelector(".jobNumber");
                number.innerHTML = `${build.number}`;
            }
            {
                let summary = clone.querySelector(".jobSummary");
                if (build.state_string == "build successful") {
                    summary.className += " success";
                } else if (build.state_string != "building") {
                    summary.className += " failure";
                }
                summary.innerHTML = `${build.state_string}`;
            }
            {
                let finished = clone.querySelector(".jobFinished");
                if (build.complete) {
                    let date_str = utils.formatRelativeDateFromNow(build.complete_at);
                    finished.textContent = `${date_str}`;
                }
                else {
                    finished.textContent = "...";
                }
            }
            {
                let duration = clone.querySelector(".jobDuration");
                if (build.complete) {
                    let duration_str = utils.formatRelativeDate(build.started_at, build.complete_at, "");
                    duration.textContent = `${duration_str}`;
                } else {
                    let date_str = utils.formatRelativeDateFromNow(build.started_at);
                    duration.textContent = `${date_str}`;
                }
            }
            targetList.appendChild(clone);
        }
    });
}

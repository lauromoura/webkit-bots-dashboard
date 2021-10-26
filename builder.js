import * as utils from "./modules/utils.js";

window.addEventListener('load', async e => {
    const urlParams = new URLSearchParams(window.location.search);
    const params = Object.fromEntries(urlParams.entries());
    const builderId = params.builder;

    const titleElement = document.getElementById("builderTitle");

    const builderInfoUrl = utils.urlFor(`builders/${builderId}`);
    const response = await fetch(builderInfoUrl);
    if (!response.ok) {
        // FIXME use some kind of alert/dialog?
        titleElement.innerText = `Failed to fetch info for builder ${builderId}`;
        return;
    }

    response.json().then(data => {
        const builderName = data.builders[0].name;
        console.log("Got builder " + builderName);
        titleElement.innerText = builderName;

        document.getElementById("builderName").innerText = builderName;
        const builderURL = utils.urlForBuilder(builderId);
        document.getElementById("builderURL").appendChild(utils.createLinkFor(builderURL, builderURL));
    });

    const jobsUrl = utils.urlFor(`builders/${builderId}/builds?limit=100&order=-number`);
    const jobsResponse = await fetch(jobsUrl);
    if (!jobsResponse.ok) {
        // FIXME use some kind of alert?
        alert("Failed to fetch jobs");
        return;
    }

    const targetList = document.querySelector('#jobsList > tbody');

    jobsResponse.json().then(data => {
        const template = document.getElementById('jobListEntry');
        data.builds.forEach(element => {
            let clone = template.content.firstElementChild.cloneNode(true);
            let number_cell = clone.querySelector('.jobNumber');
            let number_url = utils.urlFor(`builders/${builderId}/builds/${element.number}`);
            let number_link  = utils.createLinkFor(number_url, `#${element.number}`);
            number_cell.appendChild(number_link);

            if (!element.complete) {
                number_cell.classList.add('building');
            } else if (element.results == 0) {
                number_cell.classList.add('success');
            } else if (element.results == 2) {
                number_cell.classList.add('failure');
            }

            let started_cell = clone.querySelector('.jobStarted');
            let started = utils.formatRelativeDateFromNow(element.started_at);
            started_cell.innerText = started;
            
            let duration_cell = clone.querySelector('.jobDuration');
            if (element.complete) {
                let duration = utils.formatRelativeDate(element.started_at, element.complete_at, "");
                duration_cell.innerText = `${duration}`;
            } else {
                let duration = utils.formatRelativeDateFromNow(element.started_at);
                duration_cell.innerText = `${duration} and counting`;
            }

            let status_cell = clone.querySelector('.jobStatus');
            status_cell.innerText = element.state_string;

            targetList.appendChild(clone);
        });
    });
});
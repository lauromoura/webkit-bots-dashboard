import * as results from './modules/results.js';

const { Plotly } = window;

function plotRegressions(resultsData) {
  const xData = [];
  const failData = [];
  const crashData = [];
  const timeoutData = [];

  const runData = [];
  const skippedData = [];
  const knownRegressionsData = [];
  const hoverText = [];

  /* eslint camelcase: ["error", {ignoreDestructuring: true}] */
  resultsData.forEach(({ details, start_time, stats }) => {
    const startTime = new Date(0);
    startTime.setUTCSeconds(start_time);

    // let stats = element['stats'];

    // FIXME Read the results.webkit.org API doc to check why the results are coming
    // twice for each build run
    if (stats.tests_run <= 1) {
      return;
    }

    const unexpectedCrashes = stats.tests_unexpected_crashed;
    const unexpectedTimeouts = stats.tests_unexpected_timedout - unexpectedCrashes;
    const unexpectedFailures = stats.tests_unexpected_failed - unexpectedTimeouts - unexpectedCrashes;

    const testsSkipped = stats.tests_skipped;
    let testsKnownRegressions = stats.tests_crashed - unexpectedCrashes;
    testsKnownRegressions += stats.tests_failed - unexpectedFailures;
    testsKnownRegressions += stats.tests_timedout - unexpectedTimeouts;

    const st = startTime;
    const timestamp = `${st.getFullYear()}/${st.getMonth() + 1}/${st.getDate()}   ${st.getHours()}:${st.getMinutes()}:${st.getSeconds()}`;
    xData.push(timestamp);
    hoverText.push(`Build #${details['build-number']}`);
    failData.push(unexpectedFailures);
    crashData.push(unexpectedCrashes);
    timeoutData.push(unexpectedTimeouts);

    runData.push(stats.tests_run);
    skippedData.push(testsSkipped);
    knownRegressionsData.push(testsKnownRegressions);
  });

  const hoverTemplate = 'Build %{text}';

  const regressionsChart = document.getElementById('regressionsChart');
  Plotly.newPlot(regressionsChart, [
    {
      x: xData, y: failData, text: hoverText, hoverTemplate, name: 'Failures',
    },
    {
      x: xData, y: crashData, text: hoverText, hoverTemplate, name: 'Crashes',
    },
    {
      x: xData, y: timeoutData, text: hoverText, hoverTemplate, name: 'Timeouts',
    },
  ],
  { margin: { t: 0 } });

  const coverageChart = document.getElementById('coverageChart');
  Plotly.newPlot(coverageChart, [
    { x: xData, y: runData, name: 'Run' },
    { x: xData, y: skippedData, name: 'Skipped' },
    { x: xData, y: knownRegressionsData, name: 'Known regressions' },
  ],
  { margin: { t: 0 } });
}

function fillData(data) {
  const builder = data[0];

  const config = builder.configuration;
  document.getElementById('runPlatform').innerText = config.platform;
  document.getElementById('runArch').innerText = config.architecture;
  document.getElementById('runStyle').innerText = config.style;

  const resultsData = builder.results;
  plotRegressions(resultsData);
}

window.onload = () => {
  // FIXME Fetch live data after CORS is enabled at the server
  const select = document.getElementById('bot-select');
  select.addEventListener('change', (event) => {
    results.applyTo(event.target.value, fillData);
  });
  results.applyTo(select.value, fillData);
};

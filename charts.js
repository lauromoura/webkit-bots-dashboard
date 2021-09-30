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

  /* eslint camelcase: ["error", {ignoreDestructuring: true}] */
  resultsData.forEach(({ start_time, stats }) => {
    const startTime = new Date(0);
    startTime.setUTCSeconds(start_time);

    // let stats = element['stats'];

    // FIXME Read the results.webkit.org API doc to check why the results are coming
    // twice for each build run
    if (stats.tests_run <= 1) {
      return;
    }

    const unexpectedFailures = stats.tests_unexpected_failed;
    const unexpectedCrashes = stats.tests_unexpected_crashed;
    const unexpectedTimeouts = stats.tests_unexpected_timedout;

    const testsSkipped = stats.tests_skipped;
    let testsKnownRegressions = stats.tests_crashed - unexpectedCrashes;
    testsKnownRegressions += stats.tests_failed - unexpectedFailures;
    testsKnownRegressions += stats.tests_timedout - unexpectedTimeouts;

    const st = startTime;
    const timestamp = `${st.getFullYear()}/${st.getMonth()}/${st.getDay()} ${st.getHours()}:${st.getMinutes()}:${st.getSeconds()}`;
    xData.push(timestamp);
    failData.push(unexpectedFailures);
    crashData.push(unexpectedCrashes);
    timeoutData.push(unexpectedTimeouts);

    runData.push(stats.tests_run);
    skippedData.push(testsSkipped);
    knownRegressionsData.push(testsKnownRegressions);
  });
  const regressionsChart = document.getElementById('regressionsChart');
  Plotly.newPlot(regressionsChart, [
    { x: xData, y: failData, name: 'Failures' },
    { x: xData, y: crashData, name: 'Crashes' },
    { x: xData, y: timeoutData, name: 'Timeouts' },
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
  console.log(`Got ${resultsData.length} records`);
  plotRegressions(resultsData);
}

window.onload = () => {
  // FIXME Fetch live data after CORS is enabled at the server
  results.WPEReleaseLayout().then((data) => fillData(data));
};

async function loadConfig() {
  return fetch('./bots.json').then((response) => response.json());
}

export async function applyTo(configuration, callback) {
  const configs = await loadConfig();
  console.log(configs);
  if (configuration in configs) {
    console.log(`Query will be ${configs[configuration]}`);
    const params = configs[configuration];
    const url = `https://results.webkit.org/api/results/layout-tests?${params}`;
    return fetch(url).then(
      (response) => {
        console.log('Fetch from server successful');
        return response.json().then(callback);
      },
      (_) => {
        console.log('Fetch from server failed. Fallback to local file...');
        const filename = `layout-tests-${configuration}.json`;
        return fetch(filename).then((response) => response.json()).then(callback);
      },
    );
  }

  console.log(`Unsupported config: ${configuration}`);
}

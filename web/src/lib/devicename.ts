const adjectives = [
  "swift", "brave", "calm", "bright", "eager", "fierce", "gentle", "happy",
  "jolly", "kind", "lively", "merry", "noble", "proud", "quiet", "rapid",
  "sharp", "tough", "vivid", "warm",
];

const nouns = [
  "panda", "falcon", "otter", "tiger", "eagle", "koala", "lynx", "moose",
  "narwhal", "owl", "puffin", "quail", "raven", "seal", "toucan", "viper",
  "walrus", "xerus", "yak", "zebra",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateDeviceName(): string {
  return `${pick(adjectives)}-${pick(nouns)}`;
}

const STORAGE_KEY = "fd-device-name";

export function getOrCreateDeviceName(): string {
  let name = sessionStorage.getItem(STORAGE_KEY);
  if (!name) {
    name = generateDeviceName();
    sessionStorage.setItem(STORAGE_KEY, name);
  }
  return name;
}

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
  // 20 × 20 adjective-noun pairs = 400 combinations, which is too small for
  // reliable uniqueness. A 4-hex suffix expands the space to 400 × 65 536 = ~26 M.
  const suffix = Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${pick(adjectives)}-${pick(nouns)}-${suffix}`;
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

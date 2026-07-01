const fs = require("fs");
const vm = require("vm");

const html = fs.readFileSync("frontend/index.html", "utf8");
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((value) => value.trim())[0];
const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);

class ClassList {
  constructor() {
    this.values = new Set();
  }

  add(...items) {
    items.forEach((item) => this.values.add(item));
  }

  remove(...items) {
    items.forEach((item) => this.values.delete(item));
  }

  toggle(item, force) {
    if (force === undefined) {
      this.values.has(item) ? this.values.delete(item) : this.values.add(item);
      return this.values.has(item);
    }
    force ? this.values.add(item) : this.values.delete(item);
    return force;
  }

  contains(item) {
    return this.values.has(item);
  }
}

class Element {
  constructor(id = "") {
    this.id = id;
    this.value = "";
    this.checked = false;
    this.textContent = "";
    this.innerHTML = "";
    this.files = [];
    this.classList = new ClassList();
    this.dataset = {};
    this.style = {};
    this.children = [];
  }

  addEventListener() {}

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  querySelector() {
    return new Element();
  }

  querySelectorAll() {
    return [];
  }

  removeAttribute() {}

  setAttribute() {}

  getContext() {
    return {
      clearRect() {},
      drawImage() {},
      fillRect() {},
      strokeRect() {},
    };
  }
}

const elements = new Map(ids.map((id) => [id, new Element(id)]));
const document = {
  querySelector(selector) {
    if (selector.startsWith("#")) {
      return elements.get(selector.slice(1)) || null;
    }
    return new Element();
  },
  querySelectorAll() {
    return [];
  },
  createElement() {
    return new Element();
  },
  createElementNS() {
    return new Element();
  },
};

vm.runInNewContext(
  script,
  {
    document,
    console,
    window: {},
    Event: function Event() {},
    FileReader: function FileReader() {},
    Image: function Image() {},
    setTimeout,
    clearTimeout,
    fetch: async () => ({ json: async () => ({}) }),
  },
  { timeout: 1000 },
);

console.log("frontend inline script initialized");


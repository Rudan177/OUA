module.exports = {
  app: {
    name: "OOOInterface 易升",
    nameEn: "OOOInterface Update Assistant",
    shortName: "OUA",
    version: "0.8.2",
    fullVersion: "0.8.2:01-BS105",
    copyright: "© 2026 ByRUDAN 保留所有权利。",
    contact: "wyjcrtu@proton.me"
  },
  git: {
    repoUrl: "https://github.com/Rudan177/OOOInterface.git",
    defaultBranch: "LTS",
    ltsBranch: "LTS",
    mainBranch: "main",
    testBranch: "test"
  },
  urls: {
    notifications: "https://rudan177.github.io/OOOInterface/info/info-UA.json"
  },
  selfUpdate: {
    repoUrl: "https://github.com/Rudan177/OUA",
    branch: "main",
    versionPath: "renderer/js/version.js",
    readmePath: "README.md"
  },
  requiredFiles: [
    "images",
    "main",
    "manifest.json"
  ]
};

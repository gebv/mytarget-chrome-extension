chrome.browserAction.onClicked.addListener(function(activeTab){
  chrome.tabs.create({ url: "dashboard.html" });
});
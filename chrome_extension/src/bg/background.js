chrome.runtime.onMessageExternal.addListener(function(request, sender, sendResponse) {
  chrome.history.search({
    text: '',
    startTime: request.startTime,
    maxResults: 1000000
  }, function(historyItems){
    sendResponse( historyItems );
  });
  return true;
});

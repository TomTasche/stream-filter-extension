/**
 * FilterInjection Content Script.
 *
 * @author Mohamed Mansour 2011 (http://mohamedmansour.com)
 * @constructor
 */
FilterInjection = function() {
  this.settings = {};
  this.port = null;
};

FilterInjection.CONTENT_PANE_ID = '#contentPane';
FilterInjection.CONTENT_ITEM_SELECTOR = 'div[id^="update"]';
FilterInjection.ITEM_NAME_SELECTOR = 'span > a';


/**
 * Initialize the events that will be listening within this DOM.
 */
FilterInjection.prototype.init = function() {
  var googlePlusContentPane = document.querySelector(FilterInjection.CONTENT_PANE_ID);
  if (googlePlusContentPane) {
    this.initializePort();
    googlePlusContentPane.addEventListener('DOMNodeInserted',
                                           this.onGooglePlusContentModified.bind(this), false);
    setTimeout(this.renderAllItems.bind(this), 100);
  }
};

FilterInjection.prototype.initializePort = function() {
  this.port = chrome.extension.connect({name: 'stream'});
  this.port.onMessage.addListener(this.onMessage.bind(this));
  this.port.onDisconnect.addListener(this.onDisconnect.bind(this));
  this.port.postMessage({method: 'GetSettings'});
  this.port.postMessage({method: 'ResetCounter'});
};

/**
 * When the port has disconnected we need to refresh it to some degree.
 */
FilterInjection.prototype.onDisconnect = function(request) {
  this.port = null;
  setTimeout(this.initializePort.bind(this), 1000);
};

/**
 * Data has been received from the extension via Messaging provider.
 *
 * @param {Object} request The payload data received.
 */
FilterInjection.prototype.onMessage = function(request) {
  if (request.method == 'SettingsReceived') {
    this.settings = request.data;
  }
  else if (request.method == 'Reload') {
    if (request.autoreload) {
      window.location.reload();
    }
  }
};

/**
 * Render the "Share on ..." Link on each post.
 */
FilterInjection.prototype.onGooglePlusContentModified = function(e) {
  // This happens when a new stream is selected
  if (e.relatedNode && e.relatedNode.parentNode && e.relatedNode.parentNode.id == 'contentPane') {
    // We're only interested in the insertion of entire content pane
    this.renderAllItems(e.target);
  } else if (e.target.nodeType == Node.ELEMENT_NODE && e.target.id.indexOf('update') == 0) {
    this.renderItem(e.target);
  }
};

/**
 * Render on all the items of the documents, or within the specified subtree
 * if applicable
 */
FilterInjection.prototype.renderAllItems = function(subtreeDOM) {
  var queryDOM = typeof subtreeDOM == 'undefined' ? document : subtreeDOM;
  var items = queryDOM.querySelectorAll(FilterInjection.CONTENT_ITEM_SELECTOR);
  for (var i = 0; i < items.length; i++) {
    this.renderItem(items[i]);
  }
};

/**
 * Render item to filter text. This is a quick index of search remove.
 */
FilterInjection.prototype.renderItem = function(itemDOM) {
  if (!this.port || !itemDOM || !this.settings.enable_filtering || !itemDOM.parentNode || itemDOM.innerText == '') {
    return;
  }
  var textDOM = itemDOM.querySelector('div > div:nth-child(2) > div > div > div:nth-child(2) > div');
  var text = textDOM.innerText.toLowerCase();
  
  // Callback to gather stats.
  var onfilterCallback = function(filter, opt_removePost) {
    var removePost = opt_removePost || true;
    var nameDOM = itemDOM.querySelector(FilterInjection.ITEM_NAME_SELECTOR);
    if (!itemDOM.parentNode) { // no clue why this happens ...
      return;
    }
    var googleID = nameDOM.getAttribute('oid');
    var name = nameDOM.innerText;
    var postID = itemDOM.id;
    var postURL = itemDOM.querySelector('a[target="_blank"]');
    this.port.postMessage({
      method: 'SaveStat',
      user_id: googleID,
      user_name: name,
      post_id: postID,
      post_time: postURL.innerText,
      post_url: postURL.href,
      filter: filter
    });
    if (removePost) {
      itemDOM.parentNode.removeChild(itemDOM);
    }

    var filterListDiv = document.getElementById("inline-stream-filter-extension");
    if (filterListDiv == null) {
      var sidebarDiv = document.getElementsByClassName("MMGCf")[0];
      sidebarDiv.innerHTML += "<div class='c-Qa-Fe'></div><div class='D09n1e'><div class='ozLinksComponent' id='inline-stream-filter-extension'><div class='nfkPhe dZtwwe' g:li='0'><a href='" + postURL.href + "' target='_top' class='a-j c-i-j-ua tg3b4c PrSdBd nlink-0 a-l-k kBICXe WFrJMd' title='&quot;" + filter + "&quot;'><div class='JKMYAe Nb51Cb'></div>" + filter + "</a><span role='button' class='yUPzuc a-l-k'></span></div></div></div>";
    } else {
      if (document.getElementById("inline-stream-filter-extension-" + filter) == null) {
          filterListDiv.innerHTML += "<div class='nfkPhe dZtwwe' g:li='" + filterListDiv.childNodes.length + "' id='inline-stream-filter-extension-" + filter + "'><a href='" + postURL.href + "' target='_top' class='a-j c-i-j-ua tg3b4c PrSdBd nlink-0 a-l-k kBICXe WFrJMd' title='&quot;" + filter + "&quot;'><div class='JKMYAe Nb51Cb'></div>" + filter + "</a><span role='button' class='yUPzuc a-l-k'></span></div></div>";
      }
    }
  }.bind(this);
  
  // Check if we want to block gifs from running.
  if (this.settings.block_animated_gifs) {
    if (this.settings.block_animated_gifs == 'hide') {
      if (textDOM.querySelector('img[src*=".gif"]')) {
        onfilterCallback('-animated gif');
        return; // We return here since we want to force blocking.
      }
    }
    else if (this.settings.block_animated_gifs == 'freeze') {
      var images = textDOM.querySelectorAll('img[src*=".gif"]');
      for (var i = 0; i < images.length; i++) {
        var image = images[i];
        var originalImageSrc = image.src;
        var newImageSrc = originalImageSrc.replace(/\/([^\/]*)$/, '-k-o/$1');
        image.src = newImageSrc;
        image.addEventListener('mouseover', function(e) {
          image.src = originalImageSrc;
        }, false);
        
        image.addEventListener('mouseout', function(e) {
          image.src = newImageSrc;
        }, false);
      }
      // We don't return here since we might have a filter we want to control.
    }
  }
  
  // Checks if the item is a regex.
  var isRegexFilter = function(element) {
    return element[0] == '/' && element[element.length - 1] == '/';
  };
  
  // Check the exclusion filters first so we can show the user which filter
  // it was exluded in.
  if (this.settings.exclusion_filters.length > 0) {
    this.settings.exclusion_filters.forEach(function(element, index) {
      if (isRegexFilter(element)) {
        var found_pos = text.search(new RegExp(element.substring(1, element.length - 1)));
        if (found_pos != -1) {
          onfilterCallback('-' + element);
          return;
        }
      }
      else if (text.indexOf(element) != -1) {
        onfilterCallback('-' + element);
        return;
      }
    });
  }
  
  // Check if we have any inclusion filters, if it doesn't match, then we exit
  // since it doesn't match those filters.
  if (this.settings.inclusion_filters.length > 0) {
    this.settings.inclusion_filters.forEach(function(element, index) {
      if (isRegexFilter(element)) {
        var found_pos = text.search(new RegExp(element.substring(1, element.length - 1)));
        if (found_pos == -1) {
          onfilterCallback('+' + element);
          return;
        }
      }
      else if (text.indexOf(element) == -1) {
        onfilterCallback('+' + element);
        return;
      }
    });
  }
};

// Main
var injection = new FilterInjection();
injection.init();

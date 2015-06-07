"use strict";
angular.module('AdminApp', ['ng', 'ngRoute', 'ui.ace'])
.config(function($routeProvider){
  $routeProvider.when('/config', {
    controller: 'EditPageCtrl', controllerAs: 'edit',
    templateUrl: 'edit_page.template',
    resolve: {
      pageInfo: function(repoRef, $q){
        return $q.when(
          repoRef
          .contents('_config.yml')
          .fetch({ ref: 'gh-pages' })
        );
      }
    }
  });
  $routeProvider.when('/new_post', {
    controller: 'NewPostCtrl', controllerAs: 'edit',
    templateUrl: 'new_post.template',
    resolve: {
      browserHistoryAndInfo: function(getBrowserHistory, repoRef, $q){
        return $q(function(resolve, reject){
          repoRef
          .contents('_data/history_items.json')
          .fetch({ ref: 'gh-pages' })
          .then(function(historyInfo){
            var latestHistoryPublishedAt =
              JSON.parse(atob(historyInfo.content))
              .latestHistoryPublishedAt ||
              Date.now() - 1000*60*60*24*8;
            return getBrowserHistory(latestHistoryPublishedAt).then(function(browserHistory){
              resolve([ browserHistory, historyInfo ]);
            }, reject);
          }, reject);
        });
      }
    }
  });
  $routeProvider.when('/new_page', {
    controller: 'EditPageCtrl', controllerAs: 'edit',
    templateUrl: 'edit_page.template',
    resolve: {
      pageInfo: function(){}
    }
  });
  $routeProvider.when('/:file*', {
    controller: 'EditPageCtrl', controllerAs: 'edit',
    templateUrl: 'edit_page.template',
    resolve: {
      pageInfo: function(repoRef, $q, $route){
        return $q.when(
          repoRef
          .contents($route.current.params.file)
          .fetch({ ref: 'gh-pages' })
        );
      }
    }
  });
})
.provider('repoRef', function(){
  var octokat = new Octokat({ token: localStorage.getItem('github_token') });
  var repoRef;
  this.$get = function(siteConfig){
    if (!repoRef){
      repoRef = octokat.repos(siteConfig.owner, siteConfig.repo);
    }
    return repoRef;
  };
})
.factory('getFiles', function(repoRef, $q){
  function getFiles(path){
    path = path || '';
    return $q.when(
      repoRef
      .contents(path)
      .fetch({ ref: 'gh-pages' })
    ).then(function(items){
      var itemsByType = items.reduce(function(byType, item){
        byType[item.type].push(item);
        return byType;
      }, {file:[],dir:[]});
      var promises = [ $q.when(itemsByType.file) ];
      itemsByType.dir.forEach(function(item){
        if (item.path === '_tests') return;
        promises.push( getFiles(item.path) );
      });
      return $q.all(promises).then(function(fileArrays){
        return fileArrays.reduce(function(acc, files){
          return acc.concat(files);
        }, []);
      });
    });
  }
  return getFiles;
})
.factory('persistFile', function(repoRef, $q){
  return function(pageInfo){
    var path = pageInfo.path;
    delete pageInfo.path;
    pageInfo.branch = 'gh-pages';
    pageInfo.message = 'Web-update '+new Date();

    return $q.when( repoRef.contents(path).add(pageInfo) );
  };
})
.factory('getBrowserHistory', function($window, $q){
  return function(startTime){
    return $q(function(resolve, reject){
      $window.chrome.runtime.sendMessage('jejfckedhaghlefbmpeimgcbdlbkelcf', {
        startTime: startTime
      }, resolve);
    });
  };
})
.controller('NavigationCtrl', NavigationCtrl)
.controller('EditPageCtrl', EditPageCtrl)
.controller('NewPostCtrl', NewPostCtrl);

function NavigationCtrl($scope, getFiles){
  this.pages = [];
  this.posts = [];
  getFiles().then(function(files){
    files.forEach(function(file){
      if (/^_config.yml$/.test(file.path)) {
      } else if (/^_posts\//.test(file.path)){
        this.posts.push( file );
      } else {
        this.pages.push( file );
      }
    }, this);
  }.bind(this));
}

function EditPageCtrl(pageInfo, persistFile, $location){
  if (pageInfo){
    this.path    = pageInfo.path;
    this.sha     = pageInfo.sha;
    this.content = atob(pageInfo.content);
  }
  this.isNew   = !this.sha;
  try {
    var extension = this.path.match(/\.(.*)$/)[1];
    var mode = {
      'js': 'javascript',
      'md': 'markdown'
    }[extension] || extension;
    this.aceOptions = { mode: mode };
  } catch (e){
    console.log(e);
  }

  this.persistFile = persistFile;
  this.$location = $location;
}
EditPageCtrl.prototype.save = function(){
  this.saving = true;
  this.persistFile({
    path: this.path,
    content: btoa(this.content),
    sha: this.sha
  }).then(function(){
    delete this.saving;
    this.$location.path(this.path);
  }.bind(this), console.error.bind(console));
};

function NewPostCtrl(browserHistoryAndInfo, persistFile, $q){
  this.browserHistory = browserHistoryAndInfo[0] || [{
    url: '',
    title: 'Unable to fetch history!!'
  }];
  this.browserInfo = browserHistoryAndInfo[1];
  this.persistFile = persistFile;
  this.browserInfoContent = JSON.parse(atob(this.browserInfo.content));
  this.$q = $q;

  var historyHash = {};
  this.browserHistory.forEach(function(historyItem){
    var hostname = historyItem.url.match(/\/\/([^\/]+)\//)[1];
    if (!historyHash[hostname]) historyHash[hostname] = [];
    historyHash[hostname].push( historyItem );
  }, this);

  var publishedUrls = this.browserInfoContent.publishedUrls;
  this.date = new Date().toJSON().slice(0,10);
  this.content = "---\n"+
  "layout: default\n"+
  "links: 0\n"+
  "---\n";

  for (var hostname in historyHash){
    historyHash[hostname].forEach(function(historyItem){
      this.content += ' * [' + unescape(encodeURIComponent(historyItem.title)).replace(/\|/g, '\\|') + '](' + historyItem.url + ')\n';
      if (publishedUrls.hasOwnProperty( historyItem.url )){
        this.content += '   Published on '+new Date(publishedUrls[ historyItem.url ])+'\n';
      }
    }, this);
    this.content += '\n   \n\n';
  }
}
NewPostCtrl.prototype.save = function(){
  var now = Date.now();
  var postRegExp = "\\[(.+)\\]\\((.+)\\)";
  this.saving = true;
  this.browserInfoContent.latestHistoryPublishedAt = now;
  var linkMatches = (this.content.match(new RegExp(postRegExp, 'g')) || []);
  this.content = this.content.replace(/^links: \d*$/m, 'links: '+linkMatches.length);
  linkMatches.forEach(function(str){
    var data = str.match(new RegExp(postRegExp));
    this.browserInfoContent.publishedUrls[data[2]] = now;
  }, this);
  this.$q.all([
    this.persistFile({
      path: '_data/history_items.json',
      content: btoa(JSON.stringify(this.browserInfoContent)),
      sha: this.browserInfo.sha
    }),
    this.persistFile({
      path: '_posts/' + this.date + '-index.md',
      content: btoa(this.content)
    })
  ]).then(function(){
    this.$location.path('_posts/' + this.date + '-index.md');
  }.bind(this), console.error.bind(console));
};
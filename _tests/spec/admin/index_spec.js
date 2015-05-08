describe("AdminApp", function(){
  beforeEach(module('AdminApp'));

  describe("EditPageCtrl", function(){
    beforeEach(inject(function($controller){
      this.$controller = $controller;

      this.persistFileSpy = jasmine.createSpy('persistFileSpy');
      this.persistFileSpy.and.returnValue({ then: function(){} });
    }));

    describe(".save for new pages", function(){
      beforeEach(function(){
        this.controller = this.$controller('EditPageCtrl', {
          persistFile: this.persistFileSpy,
          pageInfo: null
        });
      });

      it('persists a new page', function(){
        this.controller.path = 'some_path';
        this.controller.content = 'some_contents';

        this.controller.save();

        expect(this.persistFileSpy).toHaveBeenCalledWith({
          path: 'some_path',
          content: btoa('some_contents'),
          sha: undefined
        });
      });
    });

    describe(".save for existing pages", function(){
      beforeEach(inject(function($q, $rootScope){
        var pageInfo = {
          path: 'the path',
          content: btoa('the message'),
          sha: 'abc123'
        };

        this.controller = this.$controller('EditPageCtrl', {
          persistFile: this.persistFileSpy,
          pageInfo: pageInfo
        });
      }));

      it('persists the page', function(){
        this.controller.content = 'new contents';

        this.controller.save();

        expect(this.persistFileSpy).toHaveBeenCalledWith({
          path: 'the path',
          content: btoa('new contents'),
          sha: 'abc123'
        });
      });
    });

  });

  describe("NewPostCtrl", function(){
    beforeEach(inject(function($controller){
      this.persistFileSpy = jasmine.createSpy('persistFileSpy');
      this.persistFileSpy.and.returnValue({ then: function(){} });

      var browserHistory = [
        { title: 'Title', url: 'http://somewhere.com/', publishedAt: 1431803459355 },
        { title: 'New Place', url: 'http://somewhereelse.com/' }
      ];
      var browserInfo = {
        sha: 'browserInfoSha',
        content: btoa(JSON.stringify({
          latestHistoryPublishedAt: undefined,
          publishedUrls: {
            "http://someoldplace.com/": 1431803459355,
            "http://somewhere.com/":    1431803459355
          }
        }))
      };

      this.createController = function(persistFile, bHistory, bInfo){
        return $controller('NewPostCtrl', {
          persistFile: persistFile || this.persistFileSpy,
          browserHistoryAndInfo: [
            bHistory || browserHistory,
            bInfo || browserInfo
          ]
        });
      };
    }));

    it('pre-populates the content', function(){
      expect(this.createController().content).toEqual([
        '---',
        'layout: default',
        'links: 0',
        '---',
        ' * [Title](http://somewhere.com/)',
        '   Published on '+new Date(1431803459355),
        '',
        '   ',
        '',
        ' * [New Place](http://somewhereelse.com/)',
        '',
        '   ',
        '',
        null
      ].join("\n"));
    });

    it('sorts like-urls together', function(){
      var controller = this.createController(
        null,
        [
          { url: 'http://google.com/maps/',    title: '' },
          { url: 'http://mail.google.com/',    title: '' },
          { url: 'http://agar.io/',            title: '' },
          { url: 'http://douglas-meyer.name/', title: '' },
          { url: 'http://google.com/',         title: '' }
        ]
      );
      var content = controller.content.replace(/\n\n/g, '\n');
      expect(content).toEqual([
        '---',
        'layout: default',
        'links: 0',
        '---',
        ' * [](http://google.com/maps/)',
        ' * [](http://google.com/)',
        '   ',
        ' * [](http://mail.google.com/)',
        '   ',
        ' * [](http://agar.io/)',
        '   ',
        ' * [](http://douglas-meyer.name/)',
        '   ',
        null
      ].join("\n"));
    });

    describe(".save", function(){
      it('persists a new post', function(){
        var controller = this.createController();
        controller.date = '2015-06-24';
        controller.content = 'some content';

        controller.save();

        expect(this.persistFileSpy).toHaveBeenCalledWith({
          path: '_posts/2015-06-24-index.md',
          content: btoa('some content')
        });
      });

      it('updates history data', function(){
        var controller = this.createController();
        var now = Date.now();
        controller.save();

        var persistOpts = this.persistFileSpy.calls.first().args[0];
        persistOpts.content = atob(persistOpts.content);
        expect(persistOpts).toEqual({
          path: '_data/history_items.json',
          content: JSON.stringify({
            publishedUrls: {
              'http://someoldplace.com/': 1431803459355,
              'http://somewhere.com/': now,
              'http://somewhereelse.com/': now
            },
            latestHistoryPublishedAt: now
          }),
          sha: 'browserInfoSha'
        });
      });

      it('adds "links:"', function(){
        var controller = this.createController();
        controller.save();
        var content = atob(this.persistFileSpy.calls.mostRecent().args[0].content);
        expect(content).toMatch(/^links: 2$/m);
      });

      it('escapes "|"s', function(){
        var controller = this.createController();
        controller.content = '|';
        controller.save();
        var content = atob(this.persistFileSpy.calls.mostRecent().args[0].content);
        expect(content).toEqual('\\|');
      });

      it('replaces "’"s with "\'"s', function(){
        var controller = this.createController();
        controller.content = '’';
        controller.save();
        var content = atob(this.persistFileSpy.calls.mostRecent().args[0].content);
        expect(content).toEqual('\'');
      });
    });
  });

  describe('getBrowserHistory', function(){
    beforeEach(function(){
      var browserHistory = this.browserHistory = [
        { title: 'Title',     url: 'http://somewhere.com' },
        { title: 'New Place', url: 'http://somewhereelse.com' }
      ];

      var sendMessageSpy = this.sendMessageSpy = jasmine.createSpy('sendMessageSpy');
      module(function($provide){
        sendMessageSpy.and.callFake(function(id, data, cb){
          cb(browserHistory);
        });
        $provide.value('$window', { chrome: { runtime: { sendMessage: sendMessageSpy } } });
      });
    });

    it('gives a promise of history from a certain time', function(done){
      inject(function(getBrowserHistory, $rootScope){
        getBrowserHistory('start from here').then(function(browserHistory){
          expect(browserHistory).toEqual(this.browserHistory);
          done();
        }.bind(this));
        expect(this.sendMessageSpy).toHaveBeenCalledWith(jasmine.anything(), { startTime: 'start from here' }, jasmine.anything());
        $rootScope.$digest();
      });
    });
  });

});

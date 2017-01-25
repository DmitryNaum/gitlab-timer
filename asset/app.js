;(function () {
    var gitlabTimer = new Vue({
        el: "#gitlabTimer",
        data: {
            config: {
                gitlabHost: null,
                privateKey: null,
            },
            isGitlabSupportedTimetracking: false,
            showTimeTrackingNotice: false,
            isAuthorized: false,
            showAuthDialog: false,
            projectList: [],
            issueList: [],
            currentProject: null,
            showProjectList: false,
            showIssueList: false,
            currentIssue: null,
            showPreloader: false,
            timer: null,
            timerActiveString: null,
            timerUpdateInterval: null,
            showTimerPreloader: false,
        },
        methods: {
            getUrl: function (path) {
                return this.config.gitlabHost + path;
            },
            checkGitlabVersion: function () {
                this.showPreloader = true;
                $.get(this.config.gitlabHost + '/api/v3/version', function (response) {
                    gitlabTimer.showPreloader = false;
                    gitlabTimer.isGitlabSupportedTimetracking = response.version.split('-')[0] >= '8.16.1';
                    gitlabTimer.showTimeTrackingNotice = !gitlabTimer.isGitlabSupportedTimetracking
                    if (!gitlabTimer.isGitlabSupportedTimetracking) {
                        gitlabTimer.$destroy();
                    }

                    gitlabTimer.loadProjectList()
                }, 'json');
            },
            checkPrivateKey: function () {
                if (!this.config.privateKey) {
                    return false;
                }
                this.setPrivateKey();
                this.showPreloader = true;
                    $.get(this.config.gitlabHost + '/api/v3/version', function (response) {
                        if (response.version) {
                            gitlabTimer.rememberPrivateKey();
                            gitlabTimer.isAuthorized = true;
                            gitlabTimer.showAuthDialog = false;
                        }
                        gitlabTimer.showPreloader = false;
                        gitlabTimer.checkGitlabVersion();
                    }).fail (function() {
                        gitlabTimer.showPreloader = false;
                        gitlabTimer.showAuthDialog = true;
                    });

            },
            setPrivateKey: function () {
                $.ajaxSetup({
                    headers: {'PRIVATE-TOKEN': this.config.privateKey}
                });
            },
            rememberPrivateKey: function () {
                localStorage.setItem('privateKey', this.config.privateKey);
            },
            loadProjectList: function () {
                this.showPreloader = true;
                $.getJSON(gitlabTimer.getUrl('/api/v3/projects', {per_page: 100}), function (response) {
                    gitlabTimer.projectList = response;
                    gitlabTimer.showPreloader = false;
                    gitlabTimer.showProjectList = true;
                })
            },
            formatDate: function (dateString) {
                var date = new Date(dateString);
                return date.toLocaleString();
            },
            setProject: function (id) {
                this.currentProject = id;
                this.loadIssueList();
                gitlabTimer.showProjectList = false;
            },
            loadIssueList: function () {
                this.showPreloader = true;
                var path = '/api/v3/projects/' + this.currentProject + '/issues'
                $.getJSON(gitlabTimer.getUrl(path), {state: "opened", per_page: 100}, function (response) {
                    gitlabTimer.issueList = response;
                    gitlabTimer.showPreloader = false;
                    gitlabTimer.showIssueList = true
                })
            },
            startTimer: function (issueId) {
                this.currentIssue = issueId;
                this.timer = new timer();

                $(window).on('beforeunload', function(e){
                    return null;
                }, false);

                this.timerUpdateInterval = setInterval(function () {
                    var diff = gitlabTimer.timer.getTimeInSeconds();
                    var diffDays = Math.floor(diff / 86400); // days
                    var diffHrs = Math.floor((diff % 86400) / 3600); // hours
                    var diffMins = Math.round(((diff % 86400) % 3600) / 60) || '0'; // minutes
                    var diffSec = Math.round(((diff % 86400) % 3600) % 60); // minutes

                    timeComponents = [];
                    if (diffDays) {
                        timeComponents.push(diffDays);
                    }
                    if (diffHrs) {
                        timeComponents.push(diffHrs);
                    }
                    if (diffMins) {
                        timeComponents.push(diffMins);
                    }
                    if (diffSec) {
                        timeComponents.push(diffSec);
                    }

                    var timeString = timeComponents.join(':');

                    gitlabTimer.timerActiveString = timeString;
                }, 1000)
            },
            stopTimer: function () {

                var issue = this.currentIssue;
                this.currentIssue = null;
                this.timer.stop();
                clearInterval(this.timerUpdateInterval);
                this.timerUpdateInterval = null;
                $(window).off('beforeunload');

                var spentTime = Math.floor(this.timer.getTimeInSeconds() / 60);
                if (spentTime){
                    this.showTimerPreloader = true;
                    var path = "/api/v3/projects/"+this.currentProject+"/issues/"+issue+"/add_spent_time?duration="+spentTime.toString()+"m";
                    $.post(this.getUrl(path), function(){
                        gitlabTimer.showTimerPreloader = false;
                    });
                }
            },
            isActiveIssue: function (issueId) {
                return this.currentIssue == issueId;
            }
        },
        computed: {
            getPrivateKeyUrl: function () {
                return this.config.gitlabHost + '/profile/account';
            }
        },
        mounted: function () {
            // load config file
            $.getJSON('./config.json', function (response) {
                gitlabTimer.config.gitlabHost = response.gitlabHost;
                var privateKey = localStorage.getItem('privateKey');
                if (privateKey) {
                    gitlabTimer.config.privateKey = privateKey;
                    gitlabTimer.checkPrivateKey();
                } else {
                    gitlabTimer.showAuthDialog = true;
                }
            });
        },

    });

    function timer() {
        var startTime = new Date();
        var stopTime;

        var stop = function () {
            stopTime = new Date();
        };
        var getTimeInSeconds = function () {
            var endTime = stopTime || new Date();
            var timeDiff = Math.abs(startTime.getTime() - endTime.getTime());
            var diffSeconds = Math.floor(timeDiff / 1000);

            return diffSeconds;
        }

        return {
            startTime: startTime,
            stop: stop,
            getTimeInSeconds: getTimeInSeconds
        }
    }
}());
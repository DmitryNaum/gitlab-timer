import jquery from "jquery";
import Tether from "tether";
import Vue from "vue";
import VueResource from "vue-resource";
import showdown from "showdown";
window.$ = window.Jquery = jquery;
window.Tether = Tether;
require("bootstrap");
Vue.use(VueResource);

let markdownConverter = new showdown.Converter();

let gitlabTimer = new Vue({
    el      : "#gitlabTimer",
    data    : {
        config                       : {
            gitlab: {
                host      : null,
                privateKey: null,
            }
        },
        isGitlabSupportedTimetracking: false,
        showTimeTrackingNotice       : false,
        showAuthDialog               : false,
        projectList                  : [],
        issueList                    : [],
        currentProject               : null,
        showProjectList              : false,
        showIssueList                : false,
        currentIssue                 : null,
        showPreloader                : false,
        timer                        : null,
        timerActiveString            : null,
        timerUpdateInterval          : null,
        showTimerPreloader           : false,
        gitlab                       : null,
        errorText                    : null

    },
    methods : {
        getUrl         : function (path) {
            return this.config.gitlab.host + path;
        },
        loadProjectList: function () {
            this.showPreloader = true;
            this.gitlab.getProjects().then(function (response) {
                gitlabTimer.projectList = response.body;
                gitlabTimer.showPreloader = false;
                gitlabTimer.showIssueList = false;
                gitlabTimer.showProjectList = true;
            })
        },
        formatDate     : function (dateString) {
            let date = new Date(dateString);
            return date.toLocaleString();
        },
        setProject     : function (id) {
            this.currentProject = id;
            this.showProjectList = false;
            this.loadIssueList();
        },
        loadIssueList  : function () {
            let self = this;
            self.showPreloader = true;

            this.gitlab.getOpenedIssues(this.currentProject).then(function (response) {
                self.issueList = response.body.filter(function (issue) {
                    try {
                        return issue.assignee.username === self.config.gitlab.username;
                    }
                    catch (e) {
                        return false;
                    }
                });
                self.showPreloader = false;
                self.showIssueList = true
            });
        },
        startTimer     : function (issueId) {
            if (this.currentIssue) {
                this.stopTimer();
            }
            this.currentIssue = issueId;
            this.timer = new timer();

            $(window).on('beforeunload', function (e) {
                return null;
            }, false);

            this.timerUpdateInterval = setInterval(function () {
                let formatted = gitlabTimer.timer.getFormattedTimeInSeconds();
                gitlabTimer.timerActiveString = formatted;
            }, 1000)
        },
        stopTimer      : function () {
            let self = this;
            let issue = self.currentIssue;
            self.currentIssue = null;
            self.timerActiveString = null;

            self.timer.stop();

            clearInterval(self.timerUpdateInterval);
            self.timerUpdateInterval = null;

            $(window).off('beforeunload');

            let spentTime = Math.floor(self.timer.getTimeInSeconds() / 60);
            if (spentTime) {
                self.showTimerPreloader = true;
                self.gitlab.spentTime(self.currentProject, issue, spentTime.toString() + "m").then(function () {
                    self.showTimerPreloader = false;
                });
            }
        },
        isActiveIssue  : function (issueId) {
            return this.currentIssue == issueId;
        },
        applyConfig    : function () {
            if (!this.config.gitlab.host || !this.config.gitlab.privateKey) {
                this.errorText = 'Неверные настройки';
                return;
            }
            // Сохраняем конфиг
            let serializedConfig = JSON.stringify(gitlabTimer.config);
            localStorage.setItem('config', serializedConfig);

            this.initApplication();
        },
        initApplication: function () {
            let self = this;
            // load configs
            let configData = localStorage.getItem('config');
            let config = JSON.parse(configData);
            let configIsValid = !!config && !!config.gitlab.host && !!config.gitlab.privateKey;

            if (configIsValid) {
                this.config = config;
                this.gitlab = new gitlabApi(this.config.gitlab.host, this.config.gitlab.privateKey);
                this.testConfig().then(function (data) {
                    self.showPreloader = false;

                    if (!data.privateKeyValid) {
                        self.errorText = "Gitlab PrivateKey не активен. Измените его в настройках";
                        return;
                    }
                    if (!data.gitlabVersionSupported) {
                        self.errorText = "К сожалению Ваша версия gitlab не потдерживает time tracking";
                        return;
                    }
                    self.errorText = null;

                    self.loadProjectList();
                }, function (data) {
                    if (data.status === 401) {
                        self.errorText = "Неверный Gitlab PrivateKey. Введите новый в настройках";
                    } else {
                        self.errorText = "Произошла ошибка при попытке подключения к серверу " + self.config.gitlab.host;
                    }
                });
            } else {
                let $modal = $(self.$el).find('#settingsDialog');
                if (!$modal.is('.show')) {
                    $modal.modal('show');
                }
            }
        },
        testConfig     : function () {
            let self = this;
            let promise = new Promise(function (resolve, reject) {
                let result = {
                    privateKeyValid       : undefined,
                    gitlabVersionSupported: undefined,
                };
                self.gitlab.getVersion().then(function (response) {
                    // Проверяем авторизацию
                    let body = response.body;
                    let version = body.version;
                    if (version) {
                        result.privateKeyValid = true;
                    } else {
                        result.privateKeyValid = false;
                    }

                    // проверяем версию gitlab
                    result.gitlabVersionSupported = version.split('-')[0] >= '8.16.1';
                    resolve(result);
                }, function (d) {
                    reject(d);
                });
            });

            return promise;

        }
    },
    computed: {
        getPrivateKeyUrl: function () {
            return this.getUrl('/profile/account');
        }
    },
    mounted : function () {
        this.$watch('timerActiveString', function (newVal, oldVal) {
            let baseTitle = $('title').data('title');
            if (newVal) {
                $('title').text(newVal + ' | ' + baseTitle);
            } else {
                $('title').text(baseTitle);
            }
        });

        this.initApplication();
    },

});

function timer() {
    let startTime = new Date();
    let stopTime;

    let stop = function () {
        stopTime = new Date();
    };
    let getTimeInSeconds = function () {
        let endTime = stopTime || new Date();
        let timeDiff = Math.abs(startTime.getTime() - endTime.getTime());
        let diffSeconds = Math.floor(timeDiff / 1000);

        return diffSeconds;
    };

    function formatSeconds(otherSeconds) {
        let hours = Math.floor(otherSeconds / 3600);
        let minutes = Math.floor((otherSeconds - (hours * 3600)) / 60);
        let seconds = otherSeconds - (hours * 3600) - (minutes * 60);
        let time = "";

        if (hours != 0) {
            time = hours + ":";
        }
        if (minutes != 0 || time !== "") {
            minutes = (minutes < 10 && time !== "") ? "0" + minutes : String(minutes);
            time += minutes + ":";
        }
        if (time === "") {
            time = seconds;
        }
        else {
            time += (seconds < 10) ? "0" + seconds : String(seconds);
        }
        return time;
    }

    let getFormattedTimeInSeconds = function () {
        let sec = getTimeInSeconds();

        let str = formatSeconds(sec).toString();

        let prefixes = [
            'сек',
            'мин',
            'час',
        ];
        let prefixIndex = str.split(':').length - 1;
        let prefix = prefixes[prefixIndex];

        return str + " " + prefix;
    };

    return {
        startTime                : startTime,
        stop                     : stop,
        getTimeInSeconds         : getTimeInSeconds,
        getFormattedTimeInSeconds: getFormattedTimeInSeconds
    }
}

function gitlabApi(server, privatekey) {

    if (!server) {
        throw new Error('Не указан сервер gitlab')
    }
    if (!privatekey) {
        throw new Error('Не указан приватный ключ')
    }

    let requestOptions = {
        headers: {'PRIVATE-TOKEN': privatekey}
    };

    let get = function (path, body) {
        let url = server + path;
        let opts = JSON.parse(JSON.stringify(requestOptions));
        opts.params = body;

        return Vue.http.get(url, opts);
    }


    let post = function (path, data) {
        let url = server + path;
        return Vue.http.post(url, data, requestOptions);
    }

    let getVersion = function () {
        return get('/api/v3/version');
    };

    let getProjects = function () {
        return get('/api/v3/projects/starred');
    }

    let getOpenedIssues = function (projectId) {
        let path = '/api/v3/projects/' + projectId + '/issues'
        return get(path, {state: "opened", per_page: 100});
    }

    let spentTime = function (projectId, issueId, time) {
        let path = "/api/v3/projects/" + projectId + "/issues/" + issueId + "/add_spent_time?duration=" + time
        return post(path);
    }


    return {
        getVersion     : getVersion,
        getProjects    : getProjects,
        getOpenedIssues: getOpenedIssues,
        spentTime      : spentTime
    }
}

window.gitlabApi = gitlabApi;

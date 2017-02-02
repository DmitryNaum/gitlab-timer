;(function () {
    var gitlabTimer = new Vue({
        el: "#gitlabTimer",
        data: {
            config: {
                gitlab: {
                    host: null,
                    privateKey: null,
                },
                toggl: {
                    apiKey: null
                }
            },
            projectBindings: {
                gitlabToToggl: []//{toggl:projectId, gitlab:projectId}
            },
            isGitlabSupportedTimetracking: false,
            showTimeTrackingNotice: false,
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
            gitlab: null,
            toggl: null,
            errorText: null,
            togglData: {
                workspaces: []
            }

        },
        methods: {
            getUrl: function (path) {
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
            formatDate: function (dateString) {
                var date = new Date(dateString);
                return date.toLocaleString();
            },
            setProject: function (id) {
                this.currentProject = id;
                this.showProjectList = false;
                this.loadIssueList();
            },
            loadIssueList: function () {
                var self = this;
                self.showPreloader = true;

                this.gitlab.getOpenedIssues(this.currentProject).then(function (response) {
                    var issues = response.body;

                    self.issueList = issues;
                    self.showPreloader = false;
                    self.showIssueList = true
                });
            },
            startTimer: function (issueId) {
                if (this.currentIssue) {
                    this.stopTimer();
                }
                this.currentIssue = issueId;
                this.timer = new timer();

                $(window).on('beforeunload', function (e) {
                    return null;
                }, false);

                this.timerUpdateInterval = setInterval(function () {
                    var formatted = gitlabTimer.timer.getFormattedTimeInSeconds();
                    gitlabTimer.timerActiveString = formatted;
                }, 1000);

                var issue;
                this.issueList.forEach(function (iss) {
                    if (iss.id == issueId) {
                        issue = iss;
                    }
                });
                if (!issue) {
                    return;
                }
                var togglProjectId = this.getTogglProjectIdByGitlabprojectId(issue.project_id);

                if (togglProjectId) {
                    this.toggl.createTimeEntity(issue.title, -1, this.timer.getStartTime(), togglProjectId).then(function (r) {
                        console.log(r);
                    })
                }
            },
            stopTimer: function () {
                var self = this;
                var issue = self.currentIssue;
                self.currentIssue = null;
                self.timerActiveString = null;

                self.timer.stop();

                clearInterval(self.timerUpdateInterval);
                self.timerUpdateInterval = null;

                $(window).off('beforeunload');

                var spentTime = Math.floor(self.timer.getTimeInSeconds() / 60);
                if (spentTime) {
                    self.showTimerPreloader = true;
                    self.gitlab.spentTime(self.currentProject, issue, spentTime.toString() + "m").then(function () {
                        self.showTimerPreloader = false;
                    });
                }
            },
            isActiveIssue: function (issueId) {
                return this.currentIssue == issueId;
            },
            applyConfig: function () {
                if (!this.config.gitlab.host || !this.config.gitlab.privateKey) {
                    this.errorText = 'Неверные настройки';
                    return;
                }
                // Сохраняем конфиг
                var serializedConfig = JSON.stringify(gitlabTimer.config);
                localStorage.setItem('config', serializedConfig);

                this.initApplication();
            },
            initApplication: function () {
                var self = this;
                // load configs
                var projectsBindingsData = localStorage.getItem('projectBindings');
                var projectsBindings = JSON.parse(projectsBindingsData);
                if (projectsBindings) {
                    self.projectBindings = projectsBindings;
                }

                var configData = localStorage.getItem('config');
                var config = JSON.parse(configData);

                var configIsValid = !!config && !!config.gitlab.host && !!config.gitlab.privateKey && !!config.toggl.apiKey;

                if (configIsValid) {
                    this.config = config;
                    this.gitlab = new gitlabApi(this.config.gitlab.host, this.config.gitlab.privateKey);
                    this.toggl = new togglApi(config.toggl.apiKey);
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
                        self.loadTogglWorkspacesAndProjects();
                    }, function (data) {
                        if (data.status === 401) {
                            self.errorText = "Неверный Gitlab PrivateKey. Введите новый в настройках";
                        } else {
                            self.errorText = "Произошла ошибка при попытке подключения к серверу " + self.config.gitlab.host;
                        }
                    });
                } else {
                    var $modal = $(self.$el).find('#settingsDialog');
                    if (!$modal.is('.show')) {
                        $modal.modal('show');
                    }
                }
            },
            testConfig: function () {
                var self = this;
                var promise = new Promise(function (resolve, reject) {
                    var result = {
                        privateKeyValid: undefined,
                        gitlabVersionSupported: undefined,
                    };
                    self.gitlab.getVersion().then(function (response) {
                        // Проверяем авторизацию
                        var body = response.body;
                        var version = body.version;
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

            },
            getTogglProjectIdByGitlabprojectId: function (gitlabProjectId) {
                var togglprojectId = undefined;

                this.projectBindings.gitlabToToggl.forEach(function (el) {
                    if (el.gitlab == gitlabProjectId) {
                        togglprojectId = el.toggl;
                    }
                });

                return togglprojectId;
            },
            getTogglProject: function (id) {
                var self = this;
                var togglProject = undefined;
                self.togglData.workspaces.forEach(function (workspace) {
                    if (togglProject) {
                        return;
                    }
                    workspace.projects.forEach(function (project) {
                        if (project.id == id) {
                            togglProject = project;
                        }
                    });
                });
                return togglProject;
            },
            bindTogglToGitlab: function (togglProjectId, gitlabProjectId) {
                var replaced;
                this.projectBindings.gitlabToToggl.forEach(function (el) {
                    if (el.gitlab == gitlabProjectId || el.toggl == togglProjectId) {
                        el.gitlab = gitlabProjectId;
                        el.toggl = togglProjectId;
                        replaced = true;
                    } else {
                        replaced = false;
                    }
                });
                if (!replaced) {
                    this.projectBindings.gitlabToToggl.push({gitlab: gitlabProjectId, toggl: togglProjectId});
                }

                var json = JSON.stringify(this.projectBindings);
                localStorage.setItem('projectBindings', json);
            },
            loadTogglWorkspacesAndProjects: function () {
                var self = this;
                self.toggl.getWorkspaces().then(function (response) {
                    var data = response.body;
                    data.forEach(function (el) {
                        var workspace = el;
                        workspace.projects = [];
                        self.togglData.workspaces.push(workspace);
                        self.toggl.getWorkspaceProjects(workspace.id).then(function (response) {
                            var projects = response.body;
                            if (!projects) {
                                return;
                            }
                            var wid = projects[0].wid;
                            self.togglData.workspaces.forEach(function (workspace) {
                                if (workspace.id == wid) {
                                    workspace.projects = projects;
                                }
                            })
                        })
                    })
                })
            }
        },
        computed: {
            getPrivateKeyUrl: function () {
                return this.getUrl('/profile/account');
            }
        },
        mounted: function () {
            this.$watch('timerActiveString', function (newVal, oldVal) {
                var baseTitle = $('title').data('title');
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
        var startTime = new Date();
        var stopTime;

        var stop = function () {
            stopTime = new Date();
        };
        var getStartTime = function () {
            return startTime;
        }
        var getTimeInSeconds = function () {
            var endTime = stopTime || new Date();
            var timeDiff = Math.abs(startTime.getTime() - endTime.getTime());
            var diffSeconds = Math.floor(timeDiff / 1000);

            return diffSeconds;
        }

        function formatSeconds(seconds) {
            var hours = Math.floor(seconds / 3600);
            var minutes = Math.floor((seconds - (hours * 3600)) / 60);
            var seconds = seconds - (hours * 3600) - (minutes * 60);
            var time = "";

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

        var getFormattedTimeInSeconds = function () {
            var sec = getTimeInSeconds();

            var str = formatSeconds(sec).toString();

            var prefixes = [
                'сек',
                'мин',
                'час',
            ];
            var prefixIndex = str.split(':').length - 1;
            var prefix = prefixes[prefixIndex];

            return str + " " + prefix;
        };

        return {
            startTime: startTime,
            stop: stop,
            getTimeInSeconds: getTimeInSeconds,
            getFormattedTimeInSeconds: getFormattedTimeInSeconds,
            getStartTime: getStartTime
        }
    }

    function gitlabApi(server, privatekey) {

        if (!server) {
            throw new Error('Не указан сервер gitlab')
        }
        if (!privatekey) {
            throw new Error('Не указан приватный ключ')
        }

        var requestOptions = {
            headers: {'PRIVATE-TOKEN': privatekey}
        };

        var get = function (path, body) {
            var url = server + path;
            var opts = JSON.parse(JSON.stringify(requestOptions));
            opts.params = body;

            return Vue.http.get(url, opts);
        }


        var post = function (path, data) {
            var url = server + path;
            return Vue.http.post(url, data, requestOptions);
        }

        var getVersion = function () {
            return get('/api/v3/version');
        };

        var getProjects = function () {
            return get('/api/v3/projects?per_page=100');
        }

        var getOpenedIssues = function (projectId) {
            var path = '/api/v3/projects/' + projectId + '/issues'
            return get(path, {state: "opened", per_page: 100});
        }

        var spentTime = function (projectId, issueId, time) {
            var path = "/api/v3/projects/" + projectId + "/issues/" + issueId + "/add_spent_time?duration=" + time
            return post(path);
        }


        return {
            getVersion: getVersion,
            getProjects: getProjects,
            getOpenedIssues: getOpenedIssues,
            spentTime: spentTime
        }
    }

    function togglApi(apiToken) {
        if (!apiToken) {
            throw new Error('Не указан toggle private key');
        }

        var server = 'https://www.toggl.com/api/v8/';

        var requestOptions = {
            headers: {'Authorization': "Basic " + btoa(apiToken + ":api_token")}
        };

        var get = function (path, body) {
            var url = server + path;
            var opts = JSON.parse(JSON.stringify(requestOptions));
            opts.params = body;

            return Vue.http.get(url, opts);
        };

        var post = function (path, data) {
            var url = server + path;
            return Vue.http.post(url, data, requestOptions);
        };

        var getWorkspaces = function () {
            return get('workspaces');
        };

        var getWorkspaceProjects = function (workspaceId) {
            return get('workspaces/' + workspaceId + '/projects')
        };

        var createTimeEntity = function (description, duration, start, pid) {
            var data = {
                "time_entry": {
                    description: description,
                    duration: duration,
                    start: start,
                    pid: pid
                }
            };

            return post('time_entries', data);
        }

        return {
            getWorkspaces: getWorkspaces,
            getWorkspaceProjects: getWorkspaceProjects,
            createTimeEntity: createTimeEntity

        }
    }

    window.togglApi = togglApi;
}());
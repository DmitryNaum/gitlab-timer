import jquery from "jquery";
import Tether from "tether";
import Vue from "vue";
import VueResource from "vue-resource";
// require('./module/gitlab-api');
import gitlabApi from "./module/gitlab-api";
// require('./module/toggl-api');
// require('./module/timer');
import timer from "./module/timer";
import togglApi from "./module/toggl-api";
window.$ = window.Jquery = jquery;
window.Tether = Tether;
require("bootstrap");
Vue.use(VueResource);

var gitlabTimer = new Vue({
    el: "#gitlabTimer",
    data: {
        gitlabUser: null,
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
        assigned: true,
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
            workspaces: [],
            activeTimeEntityId: null
        },
        projectListType: 'all'

    },
    methods: {
        getUrl: function (path) {
            return this.config.gitlab.host + path;
        },
        loadProjectList: function () {
            this.showPreloader = true;

            var projectLoader = null;
            switch (this.projectListType) {
                case 'all':
                    projectLoader = this.gitlab.getProjects;
                    break;
                case 'starred':
                    projectLoader = this.gitlab.getStarredProjects;
                    break;
            }
            projectLoader().then(function (response) {
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
            var self = this;
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
                var timeEntityname = "#" + issue.iid + " " + issue.title
                this.toggl.createTimeEntity(timeEntityname, -1, this.timer.getStartTime(), togglProjectId, 'gitlab-timer').then(function (response) {
                    var timeEntity = response.body.data
                    self.togglData.activeTimeEntityId = timeEntity.id;
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

            var spentTime = Math.floor(self.timer.getTimeInSeconds());
            var spentTimeInMinutes = spentTime / 60;
            if (spentTime) {
                self.showTimerPreloader = true;
                self.gitlab.spentTime(self.currentProject, issue, spentTimeInMinutes.toString() + "m").then(function () {
                    self.showTimerPreloader = false;
                });

                if (self.togglData.activeTimeEntityId) {
                    self.toggl.stopTimeEntity(self.togglData.activeTimeEntityId);
                    self.togglData.activeTimeEntityId = null;
                }
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

            var configIsValid = !!config && !!config.gitlab.host && !!config.gitlab.privateKey && !!config.toggl && !!config.toggl.apiKey;

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

                    self.gitlab.getUser().then((response) => self.gitlabUser = response.body);

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
                if (el.gitlab == gitlabProjectId) {
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
        filteredIssueList () {
            if (this.assigned) {
                return this.issueList.filter((issue) => issue.assignee && issue.assignee.id === this.gitlabUser.id);
            }

            return this.issueList;
        },
        getPrivateKeyUrl () {
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

        this.$watch('projectListType', this.loadProjectList);

        this.initApplication();
    },

});

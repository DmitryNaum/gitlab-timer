import jquery from "jquery";
import Tether from "tether";
import Vue from "vue";
import VueResource from "vue-resource";
import gitlabApi from "./module/gitlab-api";
import timer from "./module/timer";
import togglApi from "./module/toggl-api";
import VueMarkdown from 'vue-markdown';
window.$ = window.Jquery = jquery;
window.Tether = Tether;
require("bootstrap");
Vue.use(VueResource);

let gitlabTimer = new Vue({
    components: {
        VueMarkdown
    },
    el: "#gitlabTimer",
    data: {
        // Все что в том или ином виде сохраняется
        storedData: {
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
                gitlabToToggl: [] //{toggl:projectId, gitlab:projectId}
            },
        },
        gitlab: {
            api: null,
            currentUser: null,
            projects: [],
            issues: [],
            currentIssue: null,
            currentProjectId: null,
            renderedIssue:{},
        },
        projectListType: 'all',
        assigned: true,
        showTimeTrackingNotice: false,
        showPreloader: false,
        timer: null,
        timerActiveString: null,
        timerUpdateInterval: null,
        showTimerPreloader: false,
        toggl: {
            api: null,
            workspaces: [],
            activeTimeEntityId: null
        },

        isGitlabSupportedTimetracking: false,
        errorText: null,
        viewIssueInFullScreenMode: false

    },
    methods: {
        replaceImages (description) {
            let currentProject = this.gitlab.projects.filter((project) => this.gitlab.currentProjectId === project.id).shift();
            return description.replace(/\[image\]\(\/uploads/g, '[image](' + currentProject.web_url + '/uploads');
        },
        getUrl: function (path) {
            return this.storedData.config.gitlab.host + path;
        },
        loadProjectList: function () {
            this.showPreloader = true;

            let projectLoader = null;
            switch (this.projectListType) {
                case 'all':
                    projectLoader = this.gitlab.api.getProjects;
                    break;
                case 'starred':
                    projectLoader = this.gitlab.api.getStarredProjects;
                    break;
            }
            projectLoader().then(function (response) {
                gitlabTimer.gitlab.projects = response.body;
                gitlabTimer.showPreloader = false;
            })
        },
        formatDate: function (dateString) {
            let date = new Date(dateString);
            return date.toLocaleString();
        },
        setProject: function (id) {
            this.gitlab.currentProjectId = id;
            this.loadIssueList();
        },
        loadIssueList: function () {
            let self = this;
            self.showPreloader = true;

            this.gitlab.api.getOpenedIssues(this.gitlab.currentProjectId).then(function (response) {
                self.gitlab.issues = response.body;
                self.showPreloader = false;
            });
        },
        startTimer: function (issueId) {
            let self = this;
            if (this.gitlab.currentIssue) {
                this.stopTimer();
            }
            this.gitlab.currentIssue = issueId;
            this.timer = new timer();

            $(window).on('beforeunload', function () {
                return null;
            }, false);

            this.timerUpdateInterval = setInterval(function () {
                gitlabTimer.timerActiveString = gitlabTimer.timer.getFormattedTimeInSeconds();
            }, 1000);

            let issue = {};
            this.gitlab.issues.forEach(function (iss) {
                if (iss.id == issueId) {
                    issue = iss;
                }
            });
            if (!issue) {
                return;
            }
            let togglProjectId = this.getTogglProjectIdByGitlabprojectId(issue.project_id);

            if (togglProjectId) {
                let timeEntityname = "#" + issue.iid + " " + issue.title;
                this.toggl.api.createTimeEntity(timeEntityname, -1, this.timer.getStartTime(), togglProjectId, 'gitlab-timer').then(function (response) {
                    let timeEntity = response.body.data;
                    self.toggl.activeTimeEntityId = timeEntity.id;
                })
            }
        },
        stopTimer: function () {
            let self = this;
            let issue = self.gitlab.currentIssue;
            self.gitlab.currentIssue = null;
            self.timerActiveString = null;

            self.timer.stop();

            clearInterval(self.timerUpdateInterval);
            self.timerUpdateInterval = null;

            $(window).off('beforeunload');

            let spentTime = Math.floor(self.timer.getTimeInSeconds());
            let spentTimeInMinutes = spentTime / 60;
            if (spentTime) {
                self.showTimerPreloader = true;
                self.gitlab.api.spentTime(self.gitlab.currentProjectId, issue, spentTimeInMinutes.toString() + "m").then(function () {
                    self.showTimerPreloader = false;
                });

                if (self.toggl.activeTimeEntityId) {
                    self.toggl.api.stopTimeEntity(self.toggl.activeTimeEntityId);
                    self.toggl.activeTimeEntityId = null;
                }
            }
        },
        isActiveIssue: function (issueId) {
            return this.gitlab.currentIssue == issueId;
        },
        applyConfig: function () {
            let config = this.storedData.config;
            if (!config.gitlab.host || !config.gitlab.privateKey) {
                this.errorText = 'Неверные настройки';
                return;
            }
            // Сохраняем конфиг
            let serializedConfig = JSON.stringify(config);
            localStorage.setItem('config', serializedConfig);

            this.initApplication();
        },
        initApplication: function () {
            let self = this;
            // load configs
            let projectsBindingsData = localStorage.getItem('projectBindings');
            let projectsBindings = JSON.parse(projectsBindingsData);
            if (projectsBindings) {
                self.storedData.projectBindings = projectsBindings;
            }

            let configData = localStorage.getItem('config');
            let config = JSON.parse(configData);

            let configIsValid = !!config && !!config.gitlab.host && !!config.gitlab.privateKey && !!config.toggl && !!config.toggl.apiKey;

            if (configIsValid) {
                this.storedData.config = config;
                this.gitlab.api = new gitlabApi(config.gitlab.host, config.gitlab.privateKey);
                this.toggl.api = new togglApi(config.toggl.apiKey);
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

                    self.gitlab.api.getUser().then((response) => self.gitlab.currentUser = response.body);

                    self.loadProjectList();
                    self.loadTogglWorkspacesAndProjects();
                }, function (data) {
                    if (data.status === 401) {
                        self.errorText = "Неверный Gitlab PrivateKey. Введите новый в настройках";
                    } else {
                        self.errorText = "Произошла ошибка при попытке подключения к серверу " + self.storedData.config.gitlab.host;
                    }
                });
            } else {
                let $modal = $(self.$el).find('#settingsDialog');
                if (!$modal.is('.show')) {
                    $modal.modal('show');
                }
            }
        },
        testConfig: function () {
            let self = this;
            return new Promise(function (resolve, reject) {
                let result = {
                    privateKeyValid: undefined,
                    gitlabVersionSupported: undefined,
                };
                self.gitlab.api.getVersion().then(function (response) {
                    // Проверяем авторизацию
                    let body = response.body;
                    let version = body.version;
                    result.privateKeyValid = !!version;

                    // проверяем версию gitlab
                    result.gitlabVersionSupported = version.split('-')[0] >= '8.16.1';
                    resolve(result);
                }, function (d) {
                    reject(d);
                });
            });
        },
        getTogglProjectIdByGitlabprojectId: function (gitlabProjectId) {
            let togglprojectId = undefined;

            this.storedData.projectBindings.gitlabToToggl.forEach(function (el) {
                if (el.gitlab == gitlabProjectId) {
                    togglprojectId = el.toggl;
                }
            });

            return togglprojectId;
        },
        getTogglProject: function (id) {
            let self = this;
            let togglProject = undefined;
            self.toggl.workspaces.forEach(function (workspace) {
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
            let replaced;
            this.storedData.projectBindings.gitlabToToggl.forEach(function (el) {
                if (el.gitlab == gitlabProjectId) {
                    el.gitlab = gitlabProjectId;
                    el.toggl = togglProjectId;
                    replaced = true;
                } else {
                    replaced = false;
                }
            });
            if (!replaced) {
                this.storedData.projectBindings.gitlabToToggl.push({gitlab: gitlabProjectId, toggl: togglProjectId});
            }

            let json = JSON.stringify(this.storedData.projectBindings);
            localStorage.setItem('projectBindings', json);
        },
        loadTogglWorkspacesAndProjects: function () {
            let self = this;
            self.toggl.api.getWorkspaces().then(function (response) {
                let data = response.body;
                data.forEach(function (el) {
                    let workspace = el;
                    workspace.projects = [];
                    self.toggl.workspaces.push(workspace);
                    self.toggl.api.getWorkspaceProjects(workspace.id).then(function (response) {
                        let projects = response.body;
                        if (!projects) {
                            return;
                        }
                        let wid = projects[0].wid;
                        self.toggl.workspaces.forEach(function (workspace) {
                            if (workspace.id == wid) {
                                workspace.projects = projects;
                            }
                        })
                    })
                })
            })
        },
        renderIssue:function (issueId) {
            let self = this;
            this.gitlab.issues.forEach(function(issue){
                if (issue.id == issueId) {
                    self.gitlab.renderedIssue = issue;
                }
            })
        }
    },
    computed: {
        filteredIssueList () {
            if (this.assigned) {
                return this.gitlab.issues.filter((issue) => issue.assignee && issue.assignee.id === this.gitlab.currentUser.id);
            }

            return this.gitlab.issues || [];
        },
        getPrivateKeyUrl () {
            return this.getUrl('/profile/account');
        }
    },
    mounted: function () {
        this.$watch('timerActiveString', function (newVal) {
            let $title = $('title');
            let baseTitle = $title.data('title');
            if (newVal) {
                $title.text(newVal + ' | ' + baseTitle);
            } else {
                $title.text(baseTitle);
            }
        });

        this.$watch('projectListType', this.loadProjectList);

        this.$el.classList.remove('hidden-xs-up');
        this.initApplication();
    },

});

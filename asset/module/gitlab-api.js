import Vue from "vue";
import VueResource from "vue-resource";
Vue.use(VueResource);

;(function () {
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

    window.gitlabApi = gitlabApi;
}());
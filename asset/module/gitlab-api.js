import Vue from "vue";
import VueResource from "vue-resource";
Vue.use(VueResource);


function GitlabApi(server, privatekey) {

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
    };


    let post = function (path, data) {
        let url = server + path;
        return Vue.http.post(url, data, requestOptions);
    };

    let getUser = function () {
        return get('/api/v3/user');
    };

    let getVersion = function () {
        return get('/api/v3/version');
    };

    let getProjects = function () {
        return get('/api/v3/projects/starred');
    };

    let getOpenedIssues = function (projectId) {
        let path = '/api/v3/projects/' + projectId + '/issues';
        return get(path, {state: "opened", per_page: 100});
    };

    let spentTime = function (projectId, issueId, time) {
        let path = "/api/v3/projects/" + projectId + "/issues/" + issueId + "/add_spent_time?duration=" + time;
        return post(path);
    };


    return {
        getVersion     : getVersion,
        getProjects    : getProjects,
        getOpenedIssues: getOpenedIssues,
        spentTime      : spentTime,
        getUser        : getUser
    }
}

export default GitlabApi

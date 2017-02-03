import Vue from "vue";
import VueResource from "vue-resource";
Vue.use(VueResource);


function togglApi(apiToken) {
    if (!apiToken) {
        throw new Error('Не указан toggle private key');
    }

    let server = 'https://www.toggl.com/api/v8/';

    let requestOptions = {
        headers: {'Authorization': "Basic " + btoa(apiToken + ":api_token")}
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

    let put = function (path, data) {
        let url = server + path;
        return Vue.http.put(url, data, requestOptions);
    };

    let getWorkspaces = function () {
        return get('workspaces');
    };

    let getWorkspaceProjects = function (workspaceId) {
        return get('workspaces/' + workspaceId + '/projects')
    };

    let createTimeEntity = function (description, duration, start, pid, createdWith) {
        let data = {
            "time_entry": {
                description : description,
                duration    : duration,
                start       : start,
                pid         : pid,
                created_with: createdWith
            }
        };

        return post('time_entries', data);
    };

    let stopTimeEntity = function (timeEntityId) {
        let path = "time_entries/" + timeEntityId.toString() + "/stop";

        return put(path);
    };

    return {
        getWorkspaces       : getWorkspaces,
        getWorkspaceProjects: getWorkspaceProjects,
        createTimeEntity    : createTimeEntity,
        stopTimeEntity      : stopTimeEntity
    }
}

export default togglApi;

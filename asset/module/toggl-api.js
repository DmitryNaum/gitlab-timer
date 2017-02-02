import Vue from "vue";
import VueResource from "vue-resource";
Vue.use(VueResource);

;(function () {
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

        var put = function (path, data) {
            var url = server + path;
            return Vue.http.put(url, data, requestOptions);
        };

        var getWorkspaces = function () {
            return get('workspaces');
        };

        var getWorkspaceProjects = function (workspaceId) {
            return get('workspaces/' + workspaceId + '/projects')
        };

        var createTimeEntity = function (description, duration, start, pid, createdWith) {
            var data = {
                "time_entry": {
                    description: description,
                    duration: duration,
                    start: start,
                    pid: pid,
                    created_with: createdWith
                }
            };

            return post('time_entries', data);
        };

        var stopTimeEntity = function (timeEntityId) {
            var path = "time_entries/" + timeEntityId.toString() + "/stop";

            return put(path);
        };

        return {
            getWorkspaces: getWorkspaces,
            getWorkspaceProjects: getWorkspaceProjects,
            createTimeEntity: createTimeEntity,
            stopTimeEntity: stopTimeEntity
        }
    }

    window.togglApi = togglApi;
}());
function timer() {
    let startTime = new Date();
    let stopTime;

    let stop = function () {
        stopTime = new Date();
    };
    let getStartTime = function () {
        return startTime;
    }
    let getTimeInSeconds = function () {
        let endTime = stopTime || new Date();
        let timeDiff = Math.abs(startTime.getTime() - endTime.getTime());
        let diffSeconds = Math.floor(timeDiff / 1000);

        return diffSeconds;
    }

    function formatSeconds(seconds) {
        var hours = Math.floor(seconds / 3600);
        var minutes = Math.floor((seconds - (hours * 3600)) / 60);
        var seconds = seconds - (hours * 3600) - (minutes * 60);
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
        getFormattedTimeInSeconds: getFormattedTimeInSeconds,
        getStartTime             : getStartTime
    }
}

export default timer;


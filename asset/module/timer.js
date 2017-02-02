;(function () {
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

    window.timer = timer;
}());

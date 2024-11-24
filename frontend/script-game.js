let startTime;
let endTime;
let isGameRunning = false;
let apiUrl = 'https://your-api-gateway-url.amazonaws.com/prod';

document.getElementById('game-button').addEventListener('click', toggleGame);
document.getElementById('submit-score').addEventListener('click', submitScore);

function toggleGame() {
    if (!isGameRunning) {
        startGame();
    } else {
        endGame();
    }
}

function startGame() {
    startTime = new Date().getTime();
    document.getElementById('game-button').textContent = '정지';
    document.getElementById('result').style.display = 'none';
    isGameRunning = true;
}

function endGame() {
    endTime = new Date().getTime();
    const elapsedTime = (endTime - startTime) / 1000;
    const timeDifference = Math.abs(10 - elapsedTime);
    
    document.getElementById('game-button').textContent = '시작';
    document.getElementById('result').style.display = 'block';
    document.getElementById('elapsed-time').textContent = elapsedTime.toFixed(3);
    document.getElementById('time-difference').textContent = timeDifference.toFixed(3);
    
    isGameRunning = false;
}

function submitScore() {
    const playerName = document.getElementById('player-name').value;
    if (!playerName) {
        alert('이름을 입력해주세요!');
        return;
    }

    const timeDifference = parseFloat(document.getElementById('time-difference').textContent);

    fetch(`${apiUrl}/scores`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: playerName, score: timeDifference }),
    })
    .then(response => response.json())
    .then(data => {
        alert('점수가 제출되었습니다!');
        fetchLeaderboard();
    })
    .catch(error => {
        console.error('Error:', error);
        alert('점수 제출 중 오류가 발생했습니다.');
    });
}

function fetchLeaderboard() {
    fetch(`${apiUrl}/scores`)
    .then(response => response.json())
    .then(data => {
        const leaderboardList = document.getElementById('leaderboard-list');
        leaderboardList.innerHTML = '';
        data.forEach((item, index) => {
            const li = document.createElement('li');
            li.textContent = `${index + 1}. ${item.name}: ${item.score.toFixed(3)}초`;
            leaderboardList.appendChild(li);
        });
    })
    .catch(error => {
        console.error('Error:', error);
        alert('리더보드 불러오기 중 오류가 발생했습니다.');
    });
}

fetchLeaderboard();
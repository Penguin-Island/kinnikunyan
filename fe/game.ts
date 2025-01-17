import './game.scss';

const bgm = new Audio('/assets/ryugen.mp3');
bgm.loop = true;
const seStart = new Audio('/assets/start.mp3');
const seTurnChange = new Audio('/assets/turn.mp3');
const seAlarm = new Audio('/assets/alarm.mp3');
seAlarm.loop = true;

const playAndPause = (audio) => {
    audio.play();
    audio.pause();
};

const handleCompositionEnd = (el: HTMLInputElement) => {
    const str = el.value;
    const resultStr = [];
    for (let i = 0; i < str.length; i++) {
        const cc = str.charCodeAt(i);
        if ((0x3041 <= cc && cc <= 0x3096) || cc == 0x30fc) {
            resultStr.push(cc);
        } else if (0x30a1 <= cc && cc <= 0x30f6) {
            resultStr.push(cc - 96);
        }
    }
    el.value = String.fromCharCode(...resultStr);
};

const showUserInfo = () => {
    fetch('/users/info')
        .then((resp) => resp.json())
        .then((resp) => {
            document.getElementById('playerName').innerText = resp['userName'];

            document.getElementById('successRate').innerText = resp['successRate'];
            if (resp['joinedGroup']) {
                document.getElementById('startTime').innerText = resp['groupInfo']['wakeUpTime'];
                (document.getElementById('timeInput') as HTMLInputElement).value =
                    resp['groupInfo']['wakeUpTime'];
                document.getElementById('timeContainer').setAttribute('data-activated', 'yes');
                document.getElementById('noFriendsTip').setAttribute('data-activated', 'no');

                const friendsContainer = document.getElementById('friends');
                if (resp['groupInfo']['members'].length > 0) {
                    friendsContainer.innerHTML = '';
                    for (const friend of resp['groupInfo']['members']) {
                        const item = document.createElement('div');
                        item.classList.add('friend-name');
                        item.innerText = friend;
                        friendsContainer.appendChild(item);
                    }
                }
            } else {
                document.getElementById('timeContainer').setAttribute('data-activated', 'no');
                document.getElementById('noFriendsTip').setAttribute('data-activated', 'yes');
                document
                    .getElementById('startButtonContainer')
                    .setAttribute('data-activated', 'no');
            }
        })
        .catch((err) => {
            document.getElementById('alertMessage').innerText = 'ユーザー情報の取得に失敗しました';
            document.getElementById('alert').setAttribute('data-activated', 'yes');
        });
};

const showInvitations = () => {
    fetch('/groups/invitations')
        .then((resp) => resp.json())
        .then((data) => {
            if (data.length === 0) {
                return;
            }

            document.getElementById('invitationOverlay').setAttribute('data-activated', 'yes');
            const container = document.getElementById('invitationContainer');
            const template = document.getElementById(
                'invitationRowTemplate'
            ) as HTMLTemplateElement;

            for (const inv of data) {
                const row = (template.content.cloneNode(true) as DocumentFragment)
                    .firstElementChild;
                container.appendChild(row);
                (row.querySelector('.inviter-name') as HTMLElement).innerText = inv['inviter'];
                (row.querySelector('.decline') as HTMLElement).addEventListener('click', () => {
                    fetch('/groups/decline_invitation', {
                        method: 'post',
                        body: `invitationId=${inv['invitationId']}`,
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                    })
                        .then((resp) => {
                            if (resp.status !== 200) {
                                return;
                            }
                            container.removeChild(row);
                            data = data.filter((e) => e['invitationId'] !== inv['invitationId']);
                            if (data.length === 0) {
                                document
                                    .getElementById('invitationOverlay')
                                    .setAttribute('data-activated', 'no');
                            }
                        })
                        .catch((err) => {
                            console.error(err);
                            document.getElementById('alertMessage').innerText =
                                '通信に失敗しました';
                            document.getElementById('alert').setAttribute('data-activated', 'yes');
                        });
                });
                (row.querySelector('.accept') as HTMLElement).addEventListener('click', () => {
                    fetch('/groups/join', {
                        method: 'post',
                        body: `invitationId=${inv['invitationId']}`,
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                    })
                        .then((resp) => {
                            if (resp.status !== 202) {
                                return;
                            }
                            container.removeChild(row);
                            data = data.filter((e) => e['invitationId'] !== inv['invitationId']);
                            if (data.length === 0) {
                                document
                                    .getElementById('invitationOverlay')
                                    .setAttribute('data-activated', 'no');
                            }
                            showUserInfo();
                        })
                        .catch((err) => {
                            console.error(err);
                            document.getElementById('alertMessage').innerText =
                                '通信に失敗しました';
                            document.getElementById('alert').setAttribute('data-activated', 'yes');
                        });
                });
            }
        })
        .catch((err) => {
            console.error(err);
            document.getElementById('alertMessage').innerText = '招待情報の取得に失敗しました';
            document.getElementById('alert').setAttribute('data-activated', 'yes');
        });
};

addEventListener('load', () => {
    showUserInfo();
    showInvitations();

    let sock = null;
    let stillWaitingRetry = false;

    let isTyping = false;
    let isInputFocused = false;

    document.getElementById('startGame').addEventListener('click', (ev) => {
        const startButton = ev.target as HTMLInputElement;
        startButton.innerText = '相手を待っています…';
        startButton.disabled = true;

        let started = false;
        let finished = false;

        playAndPause(bgm);
        playAndPause(seStart);
        playAndPause(seTurnChange);
        playAndPause(seAlarm);

        let addr;
        if (location.protocol === 'https:') {
            addr = 'wss://';
        } else {
            addr = 'ws://';
        }
        addr += location.host;
        addr += '/game_ws';

        sock = new WebSocket(addr);
        sock.addEventListener('close', (err) => {
            if (!finished) {
                document.getElementById('alertMessage').innerText = '接続が予期せず切断されました';
                document.getElementById('alert').setAttribute('data-activated', 'yes');
            }
            bgm.pause();
            seAlarm.pause();
        });
        sock.addEventListener('message', (ev) => {
            const data = JSON.parse(ev.data);
            if (data['type'] == 'onStart') {
                started = true;

                document.getElementById('top').setAttribute('data-activated', 'no');
                document.getElementById('game').setAttribute('data-activated', 'yes');

                seStart.play();
                bgm.play();
            } else if (data['type'] == 'onChangeTurn') {
                const input = document.getElementById('wordInput') as HTMLInputElement;
                input.value = '';

                document.getElementById('prevPrefix').innerText = data['data']['prevPrefix'];
                document.getElementById('prevSuffix').innerText = data['data']['prevSuffix'];

                const yourTurn = data['data']['yourTurn'];
                document.getElementById('turn').innerText = yourTurn ? 'あなたの番' : '相手の番';
                (document.getElementById('send') as HTMLInputElement).disabled = !yourTurn;
                (document.getElementById('wordInput') as HTMLInputElement).disabled = !yourTurn;
                isTyping = yourTurn;

                if (yourTurn) {
                    seTurnChange.play();
                }
            } else if (data['type'] == 'onTick') {
                document.getElementById('countDown').innerText = data['data']['remainSec'];
                document.getElementById('waitContinueIndicator').setAttribute('data-waiting', 'no');

                if (data['data']['waitingContinue']) {
                    if (data['data']['yourFailure']) {
                        if (!stillWaitingRetry) {
                            bgm.pause();
                            seAlarm.play();
                            stillWaitingRetry = true;
                        }

                        document
                            .getElementById('failureOverlay')
                            .setAttribute('data-activated', 'yes');
                        document
                            .getElementById('finishOverlay')
                            .setAttribute('data-activated', 'no');

                        document.getElementById('continueCountDown').innerText =
                            data['data']['turnRemainSec'];
                        (document.getElementById('confirmRetry') as HTMLInputElement).disabled =
                            false;
                    } else {
                        document
                            .getElementById('waitContinueIndicator')
                            .setAttribute('data-waiting', 'yes');
                    }
                } else if (data['data']['finished']) {
                    finished = true;
                    bgm.pause();
                    seAlarm.pause();
                    setTimeout(() => {
                        location.href = '/finish/';
                    }, 1500);

                    document.getElementById('failureOverlay').setAttribute('data-activated', 'no');
                    document.getElementById('finishOverlay').setAttribute('data-activated', 'yes');
                } else {
                    if (stillWaitingRetry) {
                        stillWaitingRetry = false;
                        bgm.play();
                        seAlarm.pause();
                    }
                    document.getElementById('failureOverlay').setAttribute('data-activated', 'no');
                    document.getElementById('finishOverlay').setAttribute('data-activated', 'no');
                    document.getElementById('turnCountDown').innerText =
                        data['data']['turnRemainSec'];
                }
            } else if (data['type'] == 'onError') {
                document.getElementById('alertMessage').innerText = data['data']['reason'];
                document.getElementById('alert').setAttribute('data-activated', 'yes');

                if (!started) {
                    finished = true;
                    startButton.innerText = 'しりとり開始';
                    startButton.disabled = false;
                }
            } else if (data['type'] == 'onFailure') {
                finished = true;
                startButton.innerText = 'しりとり開始';
                startButton.disabled = false;

                if (!started) {
                    document.getElementById('alertMessage').innerText =
                        '対戦相手が来なかったため、キャンセルされました';
                    document.getElementById('alert').setAttribute('data-activated', 'yes');
                }
            } else if (data['type'] == 'onInput') {
                if (!isTyping || !isInputFocused) {
                    const input = document.getElementById('wordInput') as HTMLInputElement;
                    input.value = data['data']['value'];
                }
            }
        });
    });

    document.getElementById('closeAlert').addEventListener('click', () => {
        document.getElementById('alert').setAttribute('data-activated', 'no');
    });

    document.getElementById('wordInput').addEventListener('input', (event) => {
        const ev = event as InputEvent;

        sock.send(
            JSON.stringify({
                type: 'onInput',
                data: {
                    value: (ev.target as HTMLInputElement).value,
                },
            })
        );

        if (typeof ev.isComposing === 'undefined') {
            if (typeof ev.inputType !== 'undefined' && !ev.inputType.match(/Composition/)) {
                handleCompositionEnd(event.target as HTMLInputElement);
            }
        } else {
            if (!ev.isComposing) {
                handleCompositionEnd(event.target as HTMLInputElement);
            }
        }
    });
    document.getElementById('wordInput').addEventListener('compositionend', (event) => {
        handleCompositionEnd(event.target as HTMLInputElement);
    });
    document.getElementById('wordInput').addEventListener('focus', (event) => {
        isInputFocused = true;
    });
    document.getElementById('wordInput').addEventListener('blur', (event) => {
        isInputFocused = false;
    });

    document.getElementById('send').addEventListener('click', (ev) => {
        ev.preventDefault();
        if (sock === null) {
            return;
        }

        const input = document.getElementById('wordInput') as HTMLInputElement;
        sock.send(
            JSON.stringify({
                type: 'sendAnswer',
                data: {word: input.value},
            })
        );
        input.value = '';
    });

    document.getElementById('confirmRetry').addEventListener('click', (ev) => {
        ev.preventDefault();
        if (sock === null) {
            return;
        }

        (ev.target as HTMLInputElement).disabled = true;

        sock.send(JSON.stringify({type: 'confirmContinue', data: {}}));
    });

    document.getElementById('openTimeSettings').addEventListener('click', (ev) => {
        ev.preventDefault();

        document.getElementById('timeSettingsOverlay').setAttribute('data-activated', 'yes');
    });

    document.getElementById('setTime').addEventListener('click', (ev) => {
        ev.preventDefault();

        const value = (document.getElementById('timeInput') as HTMLInputElement).value;

        fetch('/groups/wake_up_time', {
            method: 'post',
            body: `time=${encodeURI(value)}`,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        })
            .then((resp) => {
                if (resp.status !== 200) {
                    document.getElementById('alertMessage').innerText = '設定に失敗しました';
                    document.getElementById('alert').setAttribute('data-activated', 'yes');
                    return;
                }
                showUserInfo();
                document.getElementById('timeSettingsOverlay').setAttribute('data-activated', 'no');
            })
            .catch((err) => {
                document.getElementById('alertMessage').innerText = '設定に失敗しました';
                document.getElementById('alert').setAttribute('data-activated', 'yes');
            });
    });

    let userName = null;
    document.getElementById('searchFriendButton').addEventListener('click', (ev) => {
        ev.preventDefault();

        userName = (document.getElementById('friendNameInput') as HTMLInputElement).value;
        fetch(`/users/find?userName=${encodeURI(userName)}`)
            .then((resp) => {
                if (resp.status != 302) {
                    document.getElementById('friendInviteMessage').innerText = '見つかりません';
                    return;
                }
                document.getElementById('friendSearchUserName').innerText = userName;
                document
                    .getElementById('friendSearchResultContainer')
                    .setAttribute('data-found', 'yes');
            })
            .catch((err) => {
                document
                    .getElementById('friendSearchResultContainer')
                    .setAttribute('data-found', 'no');
            });
    });

    document.getElementById('friendSearchInviteButton').addEventListener('click', () => {
        fetch('/groups/invite', {
            method: 'post',
            body: `player=${encodeURI(userName)}`,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        })
            .then((resp) => {
                if (resp.status !== 201) {
                    document
                        .getElementById('friendSearchResultContainer')
                        .setAttribute('data-found', 'no');
                    document.getElementById('alertMessage').innerText = '招待に失敗しました';
                    document.getElementById('alert').setAttribute('data-activated', 'yes');
                    return;
                }
                document
                    .getElementById('friendSearchResultContainer')
                    .setAttribute('data-found', 'no');
                (document.getElementById('friendNameInput') as HTMLInputElement).value = '';
                document.getElementById('friendInviteMessage').innerText = '招待しました';
            })
            .catch((err) => {
                document.getElementById('alertMessage').innerText = '招待に失敗しました';
                document.getElementById('alert').setAttribute('data-activated', 'yes');
            });
    });

    document.getElementById('closeFriendInviteWindow').addEventListener('click', (ev) => {
        ev.preventDefault();
        document.getElementById('friendInviteOverlay').setAttribute('data-activated', 'no');
    });

    document.getElementById('openFriendInviteButton').addEventListener('click', (ev) => {
        ev.preventDefault();
        document.getElementById('friendInviteOverlay').setAttribute('data-activated', 'yes');
    });

    document.querySelectorAll('.closeable-overlay').forEach((e) => {
        e.addEventListener('click', () => {
            e.setAttribute('data-activated', 'no');
        });
        if (e.children.length > 0) {
            e.children[0].addEventListener('click', (ev) => {
                ev.stopPropagation();
            });
        }
    });
});

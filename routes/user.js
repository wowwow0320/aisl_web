const dotenv = require("dotenv");
const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const path = require("path");
const mysql = require("mysql2");
const bcrypt = require("bcrypt");
const { hashPassword } = require("mysql/lib/protocol/Auth");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const session = require("express-session");

dotenv.config();

const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
});

//연결 오류시 에러메시지 출력
connection.connect((err) => {
    if (err) {
        console.error("데이터 베이스와 연결에 실패했습니다." + err.stack);
        return;
    }
    console.log("데이터 베이스 연결 완료 user");
});

module.exports = connection;


passport.use(
    new LocalStrategy(
        {
            usernameField: "email",
            passwordField: "pwd",
            session: true,
            passReqToCallback: false,
        },
        function (inputEmail, inputPwd, done) {
            connection.query(
                "SELECT * FROM user WHERE email = ?",
                [inputEmail],
                function (err, results) {
                    if (err) {
                        return done(err);
                    }

                    if (results.length === 0) {
                        return done(null, false);
                    }

                    const user = results[0];
                    bcrypt.compare(inputPwd, user.pwd, function (err, isMatch) {
                        if (err) {
                            return done(err);
                        }

                        if (isMatch) {
                            return done(null, user);
                        } else {
                            return done(null, false);
                        }
                    });
                }
            );
        }
    )
);

passport.serializeUser((user, done) => {
    done(null, user.email);
});

passport.deserializeUser((email, done) => {
    connection.query(
        "SELECT * FROM user WHERE email = ?",
        [email],
        function (err, results) {
            if (err) {
                return done(err);
            }

            if (results.length === 0) {
                return done(null, false, { message: "No user with this email." });
            }

            const user = results[0];
            done(null, user);
        }
    );
});

router.use(cookieParser());

router.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: false,
            httpOnly: false,
            domain: "220.6.64.130",
            path: ["/", "/user", "/notice", "/community"],
            maxAge: parseInt(process.env.SESSION_COOKIE_MAXAGE),
        },
    })
);



function checkAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    // 인증 실패에 대한 메시지와 상태 코드를 변경해주세요.
    return res.sendStatus(403);
}


function checkNotAuthenticated(req, res, next) {
    if (!req.isAuthenticated()) {
        return next();
    }
    // 이미 인증된 사용자에 대한 메시지와 상태 코드를 변경해주세요.
    return res.sendStatus(403)
};


router.get("/findemail", checkNotAuthenticated, (req, res) => {
    res.sendStatus(200);
});

router.get("/findpwd", checkNotAuthenticated, (req, res) => {
    res.sendStatus(200);
});

router.get("/changepwd", checkNotAuthenticated, (req, res) => {
    res.sendStatus(200);
});

router.post("/findemail", (req, res) => {
    const { name, question, answer } = req.body;

    // 입력 데이터 확인
    if (!name || !question || !answer) {
        return res.sendStatus(400);
    }

    const query =
        "SELECT email FROM user WHERE name = ? AND question = ? AND answer = ?";

    const params = [name, question, answer];

    connection.query(query, params, (err, results) => {
        if (err) {
            console.error(err);
            return res.sendStatus(500);
        }

        if (results.length === 0) {
            return res.sendStatus(401);
        } else {
            const email = results[0].email;
            return res.status(200).json({email});
        }
    });
});

router.post("/findpwd", (req, res) => {
    const { name, email, question, answer } = req.body;

    // 입력 데이터 확인
    if (!name || !email || !question || !answer) {
        return res.sendStatus(400);
    }

    connection.query(
        "SELECT * FROM user WHERE name = ? AND email = ? AND question = ? AND answer = ?",
        [name, email, question, answer],
        function (err, results) {
            if (err) {
                console.error(err);
                return res.sendStatus(500);
            }

            if (results.length === 0) {
                return res.sendStatus(401);
            }

            // 해당 정보와 일치하는 사용자가 있을 경우, changepwd 페이지로 이동
            res.sendStatus(200);

        }
    );
});

router.post("/changepwd", (req, res) => {
    const { email, newPwd } = req.body;

    // 입력된 새 비밀번호가 없는 경우 에러 메시지를 반환합니다.
    if (!newPwd || !email) {
        return res.sendStatus(400);
    }

    // 기존 비밀번호를 데이터베이스에서 가져옵니다.
    connection.query(
        "SELECT pwd FROM user WHERE email = ?",
        [email],
        function (err, results) {
            if (err) {
                console.error(err);
                return res.sendStatus(500);
            }

            if (results.length === 0) {
                return res.sendStatus(401);
            }

            // 가져온 기존 비밀번호를 암호화된 형태로 저장합니다.
            const oldPwd = results[0].pwd;

            // bcrypt.compare를 이용해 새 비밀번호와 기존 비밀번호를 비교합니다.
            bcrypt.compare(newPwd, oldPwd, function (err, isMatch) {
                if (err) {
                    console.error(err);
                    return res.sendStatus(500);
                }

                // 만약 새 비밀번호와 기존 비밀번호가 같다면 에러 메시지를 반환합니다.
                if (isMatch) {
                    return res.sendStatus(400);
                }

                // 새 비밀번호를 암호화합니다.
                bcrypt.hash(newPwd, 10, (err, hashedPwd) => {
                    if (err) {
                        console.error(err);
                        return res.sendStatus(500);
                    }

                    // 데이터베이스에 새 비밀번호를 저장합니다.
                    connection.query(
                        "UPDATE user SET pwd = ? WHERE email = ?",
                        [hashedPwd, email],
                        (err, result) => {
                            if (err) {
                                console.error(err);
                                return res.sendStatus(500);
                            } else {
                                res.sendStatus(200);
                            }
                        }
                    );
                });
            });
        }
    );
});

module.exports = router;
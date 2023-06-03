const dotenv = require('dotenv');
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const path = require("path");
const mysql = require("mysql2");
const bcrypt = require("bcrypt");
const { hashPassword } = require("mysql/lib/protocol/Auth");
// const db = require("./models/db");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const userRouter = require("./routes/user");
const noticeRouter = require("./routes/notice");
const communityRouter = require("./routes/community");



// 익스프레스 객체 정의
const app = express();

app.use(cors());
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());
app.use("/public/images", express.static("public/images"));
app.use(express.urlencoded({ extended: true }));

dotenv.config();

// const router = express.Router();
//데이터베이스 연결
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
    console.log("데이터 베이스 연결 완료");
});

module.exports = connection;


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

app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: { maxAge: process.env.SESSION_COOKIE_MAXAGE },
    })
);


app.use(passport.initialize());

app.use(passport.session());

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

app.use("/user", userRouter);
app.use("/notice", noticeRouter);
app.use("/community", communityRouter);


function checkAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    return res.sendStatus(200);
}

function checkNotAuthenticated(req, res, next) {
    if (!req.isAuthenticated()) {
        return next();
    }
    return res.sendStatus(200);
}

app.get("/main", (req, res) => {
    const query1 = "SELECT plan.contents, date FROM plan ORDER BY date ASC LIMIT 5";
    const query2 = `
    SELECT post.postid, user.name AS writer, post.contents,
           IFNULL(likes.likeid, 0) AS likeid, likes.liker, user.name AS liker
    FROM post
    LEFT JOIN user ON post.writer = user.userid
    LEFT JOIN likes ON post.postid = likes.postid
    ORDER BY post.createdAt ASC
    LIMIT 5
  `;
    const query3 = "SELECT title, createdAt FROM notice ORDER BY createdAt ASC LIMIT 5";

    connection.query(query1, (err, planResults) => {
        if (err) {
            console.error(err);
            res.sendStatus(500);
        } else {
            connection.query(query2, (err, postResults) => {
                if (err) {
                    console.error(err);
                    res.sendStatus(500);
                } else {
                    connection.query(query3, (err, noticeResults) => {
                        if (err) {
                            console.error(err);
                            res.sendStatus(500);
                        } else {
                            const notice = noticeResults;
                            const plan = planResults;
                            const post = postResults;

                            // plan 결과 처리 로직...
                            const mergedData = postResults.reduce((acc, row) => {
                                const { postid, writer, contents, likeid, createdAt, liker } = row;

                                if (!acc.posts.hasOwnProperty(postid)) {
                                    acc.posts[postid] = {
                                        postid,
                                        writer,
                                        contents,
                                        createdAt,
                                        likers: [], // 초기값을 빈 배열로 설정
                                    };
                                }

                                if (likeid !== 0) {
                                    acc.posts[postid].likers.push({
                                        likeid,
                                        postid,
                                        liker,
                                        createdAt,
                                    });
                                }

                                return acc;
                            }, { posts: {}});
                            const uniqueData = Object.values(mergedData.posts);

                            res.status(200).json({ notice,plan, post: uniqueData });
                        }
                    });
                }
            });
        }
    });
});

app.get("/join", checkNotAuthenticated, (req, res) => {
    res.sendStatus(200);
});

app.get("/login", checkNotAuthenticated, (req, res) => {
    res.sendStatus(200);
});

app.post("/logout", (req, res) => {
    // 세션 삭제
    req.logout();
    req.session.destroy((err) => {
        if (err) {
            console.error(err);
            return res.sendStatus(500);
        }
        // 로그아웃 후 리다이렉트할 경로
        res.status(200).clearCookie('connect.sid');
    });
});

app.post("/join", (req, res) => {
    const { name, email, pwd, question, answer } = req.body;

    // 입력 데이터 확인
    if (!name || !email || !pwd || !question || !answer) {
        return res.sendStatus(400);
    }

    // 비밀번호 암호화
    bcrypt.hash(pwd, 10, (err, hashedPwd) => {
        if (err) {
            console.error(err);
            return res.sendStatus(500);
        }

        // 중복 확인
        connection.query(
            "SELECT * FROM user WHERE email = ?",
            [email],
            function (err, results) {
                if (err) {
                    console.error(err);
                    return res.sendStatus(500);
                }

                if (results.length > 0) {
                    return res.sendStatus(409);
                }

                const params = [name, email, hashedPwd, question, answer];
                const query =
                    "INSERT INTO user (name, email, pwd, question, answer) VALUES (?, ?, ?, ?, ?)";

                // 암호화된 비밀번호를 데이터베이스에 저장
                connection.query(query, params, (err, result) => {
                    if (err) {
                        console.error(err);
                        return res.sendStatus(500);
                    }
                    res.sendStatus(200);
                });
            }
        );
    });
});

app.post(
    "/login",
    (req, res, next) => {
        // 입력 데이터 확인
        if (!req.body.email || !req.body.pwd) {
            return res.sendStatus(400);
        }
        next();
    },
    passport.authenticate("local"),
    (req, res) => {
        if (req.user) {
            // res.sendStatus(200).send("로그인 성공!");
            res.sendStatus(200);
        }
    },
    (err, req, res, next) => {
        // DB 혹은 서버 오류 처리
        if (err) {
            return res.sendStatus(500);
        }

        // 비밀번호 불일치 혹은 존재하지 않는 아이디 처리
        if (!req.user) {
            return res.sendStatus(401);
        }
    }
);


module.exports = app;

const PORT = process.env.PORT || 3000;

// 서버 실행

app.listen(PORT, function () {
    console.log(`listening on port ${PORT}`);
});
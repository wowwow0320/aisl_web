const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const path = require("path");
const mysql = require("mysql2");
const bcrypt = require("bcrypt");
const { hashPassword } = require("mysql/lib/protocol/Auth");
const db = require("./models/db");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const session = require("express-session");
const userRouter = require("./routes/user");
const noticeRouter = require("./routes/notice");
const communityRouter = require("./routes/community");

// 익스프레스 객체 정의
const app = express();
app.use(cors());
// const router = express.Router();
//데이터베이스 연결
const connection = mysql.createConnection({
    host: "127.0.0.1",
    user: "ahn",
    password: "Yongin@0322",
    database: "aiservicelab",
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
app.use(cookieParser());
app.use(
    session({
        secret: "secretCode",
        resave: false,
        saveUninitialized: true,
        cookie: { maxAge: 3600000 },
    })
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
app.use(passport.initialize());
app.use(passport.session());

app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());

app.use("/user", userRouter);
app.use("/notice", noticeRouter);
app.use("/community", communityRouter);
app.use("/public/images", express.static("public/images"));


//GET 요청이 root 경로("/")로 들어오면 'index.ejs'를 렌더링합니다.
// 로그인이 필요한 페이지에 접근하는 경우 사용
function checkAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    return res.sendStatus(200);
}

// 로그인이 되어 있는 상태에서 로그인 또는 회원 가입 페이지에 접근하는 경우 사용
function checkNotAuthenticated(req, res, next) {
    if (!req.isAuthenticated()) {
        return next();
    }
    return res.sendStatus(200);
}

app.get("/", (req, res) => {
    const query1 = "SELECT plan.contents, date FROM plan ORDER BY date ASC LIMIT 5";
    const query2 = `
    SELECT post.postid, user.name AS writer, post.contents,
           IFNULL(likes.likeid, 0) AS likeid, likes.liker, user.name AS liker
    FROM post
    LEFT JOIN user ON post.writer = user.userid
    LEFT JOIN likes ON post.postid = likes.postid
    ORDER BY post.CreatedAt ASC
    LIMIT 5
  `;
    const query3 = "SELECT title, CreatedAt FROM notice ORDER BY CreatedAt ASC LIMIT 5";

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
                            }, { posts: {}, notice: {} });
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
// ...

app.get("/logout", (req, res) => {
    // 세션 삭제
    req.session.destroy((err) => {
        if (err) {
            console.error(err);
            return res.sendStatus(500);
        }
        // 로그아웃 후 리다이렉트할 경로
        res.sendStatus(200);
    });
});

// ...

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
module.exports = app;

// GET 요청이 '/join' 경로로 들어오면 'join.ejs'를 렌더링합니다.

// POST 요청이 '/join' 경로로 들어오면, 사용자의 정보를 데이터베이스에 저장하고 성공 메시지를 반환합니다. 오류가 발생하면 오류 메시지를 반환합니다.

//앱이 3000 포트에서 실행되도록 설정합니다. 포트 번호는 환경 변수를 통해 변경할 수도 있습니다.

const PORT = process.env.PORT || 3000;

// 서버 실행

app.listen(PORT, function () {
    console.log(`listening on port ${PORT}`);
});

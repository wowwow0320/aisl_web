const dotenv = require("dotenv");
const express = require("express");
const path = require("path");
const fs = require("fs")
const router = express.Router();
const mysql = require("mysql2");
const multer = require("multer");
const cookieParser = require("cookie-parser");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const session = require("express-session");
const moment = require("moment-timezone");
const crypto = require("crypto");

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
  console.log("데이터 베이스 연결 완료 notice");
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
      secret: "secretCode",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 3600000,

      },
    })
);

// router.use("public/images", express.static(path.join(__dirname, "public/images")));
// // router.use("/public/images", express.static("public/images"));



function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  // 인증 실패에 대한 메시지와 상태 코드를 변경해주세요.
  return res.sendStatus(403);
}


function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.sendStatus(403);
  }
  // 이미 인증된 사용자에 대한 메시지와 상태 코드를 변경해주세요.
  return next();
};

function checkMaster(req, res, next) {
  const isMaster = req.user.master;

  if (isMaster == 1) {
    return next();
  }
  return res.sendStatus(403);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "./public/images");
  },
  filename: (req, file, cb) => {
    let ext = path.extname(file.originalname);
    let randomName = crypto.randomBytes(20).toString("hex");
    cb(null, `${randomName}${ext}`);
  },
});

const upload = multer({
  storage: storage,
  // fileFilter: function (req, file, cb) {
  //   let ext = path.extname(file.originalname);
  //   if(ext !== ".png" && ext !== ".jpg" && ext !== ".jpeg"){
  //     res.status(500).send("ONLY PNG, JPG");
  //   }
  //   cb(null, true);
  // },
  // limits:{
  //   fileSize: 10 * 1024 * 1024
  // }
});

router.use((req, res, next) => {
  // 세션에 visitedNotices 초기화
  req.session.visitedNotices = req.session.visitedNotices || [];
  next();
});

function saveVisitedNotice(req, res, next) {
  const visitedNotices = req.session.visitedNotices;
  const noticeid = req.params.noticeid;

  if (!visitedNotices.includes(noticeid)) {
    visitedNotices.push(noticeid);
  }

  next();
}

// router.get("/", (req, res) => {
//   const sql = "SELECT noticeid, title, contents, img, views FROM notice";
//   connection.query(sql, (err, results) => {
//     if (err) {
//       console.error(err);
//       res.sendStatus(500);
//     } else {
//       res.status(200).json(results)
//     }
//   });
// });

router.get("/", (req, res) => {
  const sql =
      `SELECT noticeid, user.name AS writer, title, contents, img, views ,createdAt
  FROM notice 
  LEFT JOIN user ON notice.writer = user.userid`;
  connection.query(sql, (err, results) => {
    if (err) {
      console.error(err);
      res.sendStatus(500);
    } else {
      const notice = results.map(row => {
        const {noticeid, title, contents, writer, views, img, createdAt } = row;
        return{
          noticeid,
          title,
          contents,
          writer,
          views,
          img,
          createdAt,
        }
      });
      res.status(200).json(notice);
    };
  });
});

// router.post("/create", checkAuthenticated, checkMaster, upload.single("img"), (req, res) => {
//   const { title, contents } = req.body;
//   const writer = req.user.userid;
//   const imageUrl = "public/images/" + req.file.filename;
//   const createdAt = new Date(); // 현재 날짜와 시간

//   const sql =
//       "INSERT INTO notice (title, contents, writer, img, createdAt) VALUES (?, ?, ?, ?, ?)";
//   connection.query(
//       sql,
//       [title, contents, writer, imageUrl, createdAt],
//       (err, result) => {
//         if (err) {
//           console.error(err);
//           res.sendStatus(500);
//         } else {
//           if (result.affectedRows === 1) {
//             const notice = {
//               noticeid: result.insertId,
//               title,
//               contents,
//               writer,
//               img: imageUrl,
//               createdAt,
//               views: 0,
//             };
//             res.status(201).json(notice)
//           } else {
//             res.sendStatus(403);
//           }
//         }
//       }
//   );
// });
router.post("/create", checkAuthenticated, checkMaster, upload.single("img"), (req, res) => {
  const { title, contents } = req.body;
  const writer = req.user.userid;
  let imageUrl = "http://220.66.64.130:3000/public/images/" + req.file.filename;
  const createdAt = new Date(); // 현재 날짜와 시간

  const sql =
      "INSERT INTO notice (title, contents, writer, img, createdAt) VALUES (?, ?, ?, ?, ?)";
  connection.query(
      sql,
      [title, contents, writer, imageUrl, createdAt],
      (err, result) => {
        if (err) {
          console.error(err);
          res.sendStatus(500);
        } else {
          if (result.affectedRows === 1) {
            const notice = {
              noticeid: result.insertId,
              title,
              contents,
              writer,
              img: imageUrl,
              createdAt,
              views: 0,
            };
            res.status(201).json(notice)
          } else {
            res.sendStatus(403);
          }
        }
      }
  );
});

router.post("/update",checkAuthenticated, checkMaster, upload.single("img"), (req, res) => {
  const { title, contents, noticeid } = req.body;

  // 이전 이미지 URL 가져오기
  const getPreviousImageUrlQuery = "SELECT img FROM notice WHERE noticeid = ?";
  connection.query(getPreviousImageUrlQuery, [noticeid], (err, result) => {
    if (err) {
      console.error(err);
      res.sendStatus(500);
    } else {
      if (result.length === 0) {
        res.sendStatus(404);
      } else {
        const previousImageUrl = result[0].img;
        let newImageUrl = previousImageUrl; // 기존 이미지 URL 유지

        // 새로운 이미지가 업로드된 경우
        if (req.file) {
          newImageUrl = "public/images/" + req.file.filename;

          // 이전 이미지가 존재하는 경우 삭제
          if (previousImageUrl) {
            const imagePath = path.join(__dirname, "..", previousImageUrl);
            fs.unlink(imagePath, (err) => {
              if (err) {
                console.error(err);
              }
            });
          }
        } else {
          // 이미지가 업로드되지 않은 경우
          // 이미지 URL 제거
          newImageUrl = null;
        }

        // 이미지 URL 업데이트 또는 제거
        const updateQuery =
            "UPDATE notice SET title = ?, contents = ?, img = ? WHERE noticeid = ?";
        const updateParams = [title, contents, newImageUrl, noticeid];

        connection.query(updateQuery, updateParams, (err, result) => {
          if (err) {
            console.error(err);
            res.sendStatus(500);
          } else {
            if (result.affectedRows === 0) {
              res.sendStatus(500);
            } else {
              // 업데이트 성공
              // 업데이트된 공지사항 반환
              const notice = {
                noticeid: parseInt(noticeid),
                title,
                contents,
                img: newImageUrl,
                views: 0,
              };
              res.status(200).json(notice)
            }
          }
        });
      }
    }
  });
});

router.post("/delete", checkAuthenticated, checkMaster, (req, res) => {
  const noticeid = req.body.noticeid;

  const sql = "DELETE FROM notice WHERE noticeid = ?";
  connection.query(sql, [noticeid], (err, results) => {
    if (err) {
      res.sendStatus(500);
    } else {
      if (results && results.affectedRows > 0) {
        res.sendStatus(201);
      } else {
        res.sendStatus(403);
      }
    }
  });
});

router.post("/detail", saveVisitedNotice, (req, res) => {
  const noticeid = req.body.noticeid;

  const sql =
      "UPDATE notice SET views = views + 1 WHERE noticeid = ?";
  connection.query(sql, [noticeid], (err, results) => {
    if (err) {
      console.error(err);
      res.sendStatus(500);
    } else {
      if (results.length === 0) {
        res.sendStatus(404);
      } else {
        if (!req.session.visitedNotices.includes(noticeid)) {
          const updateSql =
              `SELECT noticeid, user.name AS writer, title, contents, img, views, createdAt
          FROM notice 
          LEFT JOIN user ON notice.writer = user.userid
          WHERE noticeid = ?`;

          connection.query(updateSql, [noticeid], (err, updateResultser) => {
            if (err) {
              console.error(err);
              res.sendStatus(500);
            } else {
              if (updateResultser.length === 0) {
                res.sendStatus(404);
              } else {
                const notice = updateResultser[0];
                res.status(200).json(notice);
              }
            }
          });
        }
      }
    }
  });
});

module.exports = router;
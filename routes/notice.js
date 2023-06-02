const express = require("express");
const router = express.Router();
const mysql = require("mysql2");
const multer = require("multer");
const cookieParser = require("cookie-parser");
const session = require("express-session");


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
router.use(cookieParser());

router.use(
    session({
      secret: "secretcode",
      resave: false,
      saveUninitialized: true,
    })
);

function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  return res.status(200);
}

// 로그인이 되어 있는 상태에서 로그인 또는 회원 가입 페이지에 접근하는 경우 사용
function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.status(200);
  }
  return next();
}
function checkMaster(req, res, next) {
  const isMaster = req.user.master;

  if (isMaster == 1) {
    return next();
  }
  return res.status(200);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/images/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage: storage });
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

router.get("/", (req, res) => {
  const sql = "SELECT noticeid, title, contents, img, views FROM notice";
  connection.query(sql, (err, results) => {
    if (err) {
      console.error(err);
      res.status(500);
    } else {
      res.status(200).json(results);
    }
  });
});


router.post("/create", checkMaster, upload.single("img"), (req, res) => {
  const { title, contents } = req.body;
  const writer = req.user.userid;
  const imageUrl = "/public/images/" + req.file.filename;
  const createdAt = new Date(); // 현재 날짜와 시간

  const sql =
      "INSERT INTO notice (title, contents, writer, img, createdAt) VALUES (?, ?, ?, ?, ?)";
  connection.query(
      sql,
      [title, contents, writer, imageUrl, createdAt],
      (err, result) => {
        if (err) {
          console.error(err);
          res.status(500);
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
            res.status(201).json(notice);
          } else {
            res.status(403);
          }
        }
      }
  );
});

router.post("/update", checkMaster, upload.single("img"), (req, res) => {
  const { title, contents, noticeid } = req.body;

  // 이전 이미지 URL 가져오기
  const getPreviousImageUrlQuery = "SELECT img FROM notice WHERE noticeid = ?";
  connection.query(getPreviousImageUrlQuery, [noticeid], (err, result) => {
    if (err) {
      console.error(err);
      res.status(500);
    } else {
      if (result.length === 0) {
        res.status(404);
      } else {
        const previousImageUrl = result[0].img;
        let newImageUrl = previousImageUrl; // 기존 이미지 URL 유지

        // 새로운 이미지가 업로드된 경우
        if (req.file) {
          newImageUrl = "/public/images/" + req.file.filename;

          // 이전 이미지가 존재하는 경우 삭제
          if (previousImageUrl) {
            const fs = require("fs");
            const path = require("path");
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
            res.status(500);
          } else {
            if (result.affectedRows === 0) {
              res.status(500);
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
              res.status(200).json(notice);
            }
          }
        });
      }
    }
  });
});

router.post("/delete", checkMaster, (req, res) => {
  const noticeid = req.body.noticeid;

  const sql = "DELETE FROM notice WHERE noticeid = ?";
  connection.query(sql, [noticeid], (err, results) => {
    if (err) {
      res.status(500);
    } else {
      if (results && results.affectedRows > 0) {
        res.status(201);
      } else {
        res.status(403);
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
      res.status(500);
    } else {
      if (results.length === 0) {
        res.status(404);
      } else {


        // 조회수 증가 로직을 추가합니다.
        if (!req.session.visitedNotices.includes(noticeid)) {
          const updateSql =
              "SELECT * FROM notice WHERE noticeid = ?";
          connection.query(updateSql, [noticeid], (err, updateResultser) => {
            if (err) {
              console.error(err);
              res.status(500);
            } else {
              if (results.length === 0) {
                res.status(404);
              } else{
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

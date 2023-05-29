const express = require("express");
const router = express.Router();
const mysql = require("mysql2");
const multer = require("multer");
const session = require("express-session");

const connection = mysql.createConnection({
  host: "127.0.0.1",
  user: "root",
  password: "0322",
  database: "web",
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
  return res.redirect("/login");
}

// 로그인이 되어 있는 상태에서 로그인 또는 회원 가입 페이지에 접근하는 경우 사용
function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect("/");
  }
  return next();
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
      res.status(500).json({ error: "Internal server error" });
    } else {
      res.json(results);
    }
  });
});

router.get("/update/:noticeid", checkAuthenticated, (req, res) => {
  const noticeid = req.params.noticeid; // 게시물의 고유 식별자(ID)
  const writer = req.user.userid; // 현재 로그인한 사용자의 ID

  // 게시물 조회 SQL 쿼리 실행
  const query = "SELECT * FROM notice WHERE noticeid = ? AND writer = ?";
  connection.query(query, [noticeid, writer], (err, results) => {
    if (err) {
      console.error(err);
      res.status(500).send("notice 조회 중 오류가 발생했습니다.");
    } else {
      if (results && results.length > 0) {
        const notice = results[0];
        console.log("성공");
        res.status(200).render("updatenotice.ejs", { notice }); //  수정 페이지 렌더링
      } else {
        res.status(404).send("해당하는 notice 찾을 수 없습니다.");
      }
    }
  });
});

router.get("/delete/:noticeid", checkAuthenticated, (req, res) => {
  const noticeid = req.params.noticeid; // 게시물의 고유 식별자(ID)
  const writer = req.user.userid; // 현재 로그인한 사용자의 ID

  // 게시물 조회 SQL 쿼리 실행
  const query = "SELECT * FROM notice WHERE noticeid = ? AND writer = ?";
  connection.query(query, [noticeid, writer], (err, results) => {
    if (err) {
      console.error(err);
      res.status(500).send("notice 조회 중 오류가 발생했습니다.");
    } else {
      if (results && results.length > 0) {
        const notice = results[0];
        console.log("성공");
        res.status(200).render("deletenotice.ejs", { notice }); //  수정 페이지 렌더링
      } else {
        res.status(404).send("해당하는 notice 찾을 수 없습니다.");
      }
    }
  });
});

router.post("/create", upload.single("img"), (req, res) => {
  const { title, contents, writer } = req.body;
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
        res.status(500).json({ error: "Internal server error" });
      } else {
        const notice = {
          noticeid: result.insertId,
          title,
          contents,
          writer,
          img: imageUrl,
          createdAt,
          views: 0,
        };
        res.json(notice);
      }
    }
  );
});

router.post("/update/:noticeid", upload.single("img"), (req, res) => {
  const { title, contents } = req.body;
  const noticeid = req.params.noticeid;

  // 이전 이미지 URL 가져오기
  const getPreviousImageUrlQuery = "SELECT img FROM notice WHERE noticeid = ?";
  connection.query(getPreviousImageUrlQuery, [noticeid], (err, result) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: "내부 서버 오류" });
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
      }

      // 이미지 URL 업데이트 또는 제거
      const updateQuery =
        "UPDATE notice SET title = ?, contents = ?, img = ? WHERE noticeid = ?";
      const updateParams = [title, contents, newImageUrl, noticeid];
      if (!newImageUrl) {
        updateParams[2] = null; // 이미지 제거
      }

      connection.query(updateQuery, updateParams, (err, result) => {
        if (err) {
          console.error(err);
          res.status(500).json({ error: "내부 서버 오류" });
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
          res.json(notice);
        }
      });
    }
  });
});

router.delete("/delete/:noticeid", (req, res) => {
  const noticeid = req.params.noticeid;

  // 이미지 삭제를 위한 추가 로직
  const query = "SELECT img FROM notice WHERE noticeid = ?";
  connection.query(query, [noticeid], (err, result) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    } else {
      const imageUrl = result[0].img;

      // 이미지 삭제
      if (imageUrl) {
        const fs = require("fs");
        const path = require("path");

        const imagePath = path.join(__dirname, "..", imageUrl);
        fs.unlink(imagePath, (err) => {
          if (err) {
            console.error(err);
          }
        });
      }

      const sql = "DELETE FROM notice WHERE noticeid = ?";
      connection.query(sql, [noticeid], (err, result) => {
        if (err) {
          console.error(err);
          res.status(500).json({ error: "Internal server error" });
        } else {
          if (result.affectedRows === 0) {
            res.status(404).json({ error: "Notice not found" });
          } else {
            res.json({ message: "Notice deleted" });
          }
        }
      });
    }
  });
});

router.get("/:noticeid", saveVisitedNotice, (req, res) => {
  const noticeid = req.params.noticeid;

  const sql =
    "SELECT noticeid, title, contents, img, views FROM notice WHERE noticeid = ?";
  connection.query(sql, [noticeid], (err, results) => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    } else {
      if (results.length === 0) {
        res.status(404).json({ error: "Notice not found" });
      } else {
        const notice = results[0];

        // 조회수 증가 로직을 추가합니다.
        if (!req.session.visitedNotices.includes(noticeid)) {
          const updateSql =
            "UPDATE notice SET views = views + 1 WHERE noticeid = ?";
          connection.query(updateSql, [noticeid], (err) => {
            if (err) {
              console.error(err);
            }
          });
        }

        res.json(notice);
      }
    }
  });
});
router.post("/views", (req, res)=>{
  const noticeid = req.body.noticeid;

  const sql = "SELECT * FROM notice WHERE noticeid = ?";
  connection.query(sql, [noticeid], (err, results)=>{
    if (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    } else{

    }
  })
});

module.exports = router;

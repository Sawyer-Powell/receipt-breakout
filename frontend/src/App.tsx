import { forwardRef, useEffect, useRef, useState } from "react";
import { getLineItems, getReceipts, uploadReceipt } from "./api";

const baseUrl = "";

type vec2 = {
  x: number;
  y: number;
};

interface PaddleProps {
  position: vec2;
}
const Paddle = forwardRef<HTMLDivElement, PaddleProps>(({ position }, ref) => {
  return (
    <>
      <div
        ref={ref}
        className="w-30 h-5 bg-red-400 shadow-lg absolute"
        style={{ left: `${position.x}px`, top: `${position.y}px` }}
      ></div>
    </>
  );
});

interface ObstacleProps {}
const Obstacle = forwardRef<HTMLDivElement, ObstacleProps>(({}, ref) => {
  return <div ref={ref} className="w-30 h-20 bg-green-400 shadow-lg"></div>;
});

interface BallProps {
  position: vec2;
}
const Ball = forwardRef<HTMLDivElement, BallProps>(({ position }, ref) => {
  return (
    <>
      <div
        className="rounded-full w-5 h-5 bg-blue-400 shadow-lg absolute"
        ref={ref}
        style={{ left: `${position.x}px`, top: `${position.y}px` }}
      ></div>
    </>
  );
});

const applyVelocity = (pos: vec2, vel: vec2, deltaT: number): vec2 => {
  return {
    x: pos.x + vel.x * deltaT,
    y: pos.y + vel.y * deltaT,
  };
};

type collision_description = {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
};

const handleContainerCollisions = (
  container: HTMLDivElement,
  object: HTMLDivElement,
  object_pos: vec2,
  object_vel: vec2,
  reflect: boolean = true,
): [vec2, vec2, collision_description] => {
  let new_pos = { ...object_pos };
  let new_vel = { ...object_vel };
  let collision: collision_description = {
    top: false,
    right: false,
    bottom: false,
    left: false,
  }; // right left bottom top

  if (object_pos.x > container.clientWidth - object.clientWidth) {
    if (reflect) new_vel.x *= -1;
    new_pos.x = container.clientWidth - object.clientWidth;
    collision.right = true;
  } else if (object_pos.x < 0) {
    if (reflect) new_vel.x *= -1;
    new_pos.x = 0;
    collision.left = true;
  }

  if (object_pos.y > container.clientHeight - object.clientHeight) {
    if (reflect) new_vel.y *= -1;
    new_pos.y = container.clientHeight - object.clientHeight;
    collision.bottom = true;
  } else if (object_pos.y <= 0) {
    if (reflect) new_vel.y *= -1;
    new_pos.y = 0;
    collision.top = true;
  }

  return [new_pos, new_vel, collision];
};

/**
 * Returns [newPos, newVel] of ball
 */
const handleBallRectangleCollision = (
  ball: HTMLDivElement,
  ballVel: vec2,
  ballPos: vec2,
  rectangle: HTMLDivElement,
): [vec2, vec2, collision_description] => {
  const radius = ball.clientWidth / 2;
  const ballCenter: vec2 = {
    x: ballPos.x + radius,
    y: ballPos.y + radius,
  };

  const bbox = rectangle.getBoundingClientRect();
  const closestX = Math.max(bbox.left, Math.min(ballCenter.x, bbox.right));
  const closestY = Math.max(bbox.top, Math.min(ballCenter.y, bbox.bottom));

  const distanceX = ballCenter.x - closestX;
  const distanceY = ballCenter.y - closestY;
  const distance = distanceX * distanceX + distanceY * distanceY;

  let newBallVel = { ...ballVel };
  let newBallPos = { ...ballPos };
  let collision_desc: collision_description = {
    top: false,
    bottom: false,
    right: false,
    left: false,
  };

  if (distance > radius ** 2) return [newBallPos, newBallVel, collision_desc];

  // Handle corner collisions
  if (
    (closestX == bbox.right && closestY == bbox.bottom) ||
    (closestX == bbox.right && closestY == bbox.top) ||
    (closestX == bbox.left && closestY == bbox.top) ||
    (closestX == bbox.left && closestY == bbox.bottom)
  ) {
    let collisionNormal: vec2 = {
      x: ballCenter.x - closestX,
      y: ballCenter.y - closestY,
    };

    let collisionNormalLength = Math.sqrt(
      collisionNormal.x ** 2 + collisionNormal.y ** 2,
    );

    collisionNormal = {
      x: collisionNormal.x / collisionNormalLength,
      y: collisionNormal.y / collisionNormalLength,
    };

    let dotProduct =
      2 * (ballVel.x * collisionNormal.x + ballVel.y * collisionNormal.y);

    newBallVel.x = ballVel.x - dotProduct * collisionNormal.x;
    newBallVel.y = ballVel.y - dotProduct * collisionNormal.y;
  } else if (closestX == bbox.right || closestX == bbox.left) {
    newBallVel.x *= -1;
  } else if (closestY == bbox.top || closestY == bbox.bottom) {
    newBallVel.y *= -1;
  }

  // Updating ball pos
  if (closestX == bbox.right) {
    newBallPos.x = bbox.right;
    collision_desc.right = true;
  } else if (closestX == bbox.left) {
    newBallPos.x = bbox.left - ball.clientWidth;
    collision_desc.left = true;
  } else if (closestY == bbox.bottom) {
    newBallPos.y = bbox.bottom;
    collision_desc.bottom = true;
  } else if (closestY == bbox.top) {
    newBallPos.y = bbox.top - ball.clientHeight;
    collision_desc.top = true;
  }

  return [newBallPos, newBallVel, collision_desc];
};

type Obstacle = {
  active: boolean;
  score: number;
  img_path: string;
};

type Receipt = {
  id: number;
  path: string;
};

enum GameEnum {
  NEEDSUPLOAD,
  READYTOSELECT,
  PLAYING,
  GAMEOVER,
  YOUWON,
  NONE,
}

type GameState = {
  paddlePos: vec2;
  paddleVel: vec2;
  ballPos: vec2;
  ballVel: vec2;
  obstacles: Obstacle[];
  score: number;
  lives: number;
  state: GameEnum;
};

const defaultGameState = {
  paddlePos: { x: 100, y: 740 },
  paddleVel: { x: 0, y: 0 },
  ballPos: { x: 500, y: 700 },
  ballVel: { x: -0.3, y: -0.3 },
  obstacles: [],
  score: 0,
  lives: 3,
  state: GameEnum.NONE,
};

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const paddleRef = useRef<HTMLDivElement>(null);
  const ballRef = useRef<HTMLDivElement>(null);
  const obstacleContainer = useRef<HTMLDivElement>(null);

  const internalGameState = useRef<GameState>({
    ...defaultGameState,
  });

  const [gameState, setGameState] = useState({ ...internalGameState.current });
  const [receipts, setReceipts] = useState<Receipt[]>([]);

  const lastTimeRef = useRef<number>(0);
  const animationRef = useRef<number | null>(null);

  const keysPressed = useRef({ ArrowLeft: false, ArrowRight: false });
  const [uploading, setUploading] = useState(false);

  const onReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target?.files?.[0];

    if (file == undefined) return;
    setUploading(true);
    await uploadReceipt(file, file.name);
    setUploading(false);

    refreshReceipts();
    internalGameState.current.state = GameEnum.READYTOSELECT;
  };

  const selectReceipt = async (id: number) => {
    const lineItems: any[] = await getLineItems(id);
    console.log(lineItems);

    internalGameState.current = {
      ...defaultGameState,
      obstacles: lineItems.map((item) => {
        return {
          score: item["price"],
          active: true,
          img_path: `${baseUrl}/${item["path"]}`,
        };
      }),
      state: GameEnum.PLAYING,
    };
  };

  const refreshReceipts = () => {
    getReceipts().then((r) => {
      setReceipts(r);
      if (r.length > 0) {
        internalGameState.current.state = GameEnum.READYTOSELECT;
      } else {
        internalGameState.current.state = GameEnum.NEEDSUPLOAD;
      }
    });
  };

  // Sets our update game function to run on every frame
  useEffect(() => {
    refreshReceipts();

    // Set up keyboard event listeners
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        keysPressed.current[e.key] = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        keysPressed.current[e.key] = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    const renderInterval = 16; // ~60fps
    let timeSinceLastRender = 0;

    const gameLoop = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const deltaTime = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      // Update physics using the ref
      updateGame(deltaTime);

      // Update React state for rendering (which updates the DOM)
      timeSinceLastRender += deltaTime;
      if (timeSinceLastRender >= renderInterval) {
        setGameState({ ...internalGameState.current });
        timeSinceLastRender = 0;
      }

      animationRef.current = requestAnimationFrame(gameLoop);
    };

    animationRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const handleNewGame = () => {
    internalGameState.current = {
      ...defaultGameState,
      obstacles: [],
      state: GameEnum.READYTOSELECT,
    };
  };

  const uploadNew = () => {
    internalGameState.current = {
      ...defaultGameState,
      obstacles: [],
      state: GameEnum.NEEDSUPLOAD,
    };
  };

  const updateGame = (deltaTime: number) => {
    let pgs = internalGameState.current;

    if (pgs.state != GameEnum.PLAYING) {
      return;
    }

    let newScore = pgs.score;
    let newLives = pgs.lives;
    let newState: GameEnum = pgs.state;

    const container = containerRef.current;
    const paddle = paddleRef.current;
    const ball = ballRef.current;
    const obstacles = obstacleContainer.current;

    if (!container || !paddle || !ball || !obstacles) return pgs;

    let newPaddleVel = { ...pgs.paddleVel };
    if (keysPressed.current.ArrowLeft) newPaddleVel.x = -0.5;
    else if (keysPressed.current.ArrowRight) newPaddleVel.x = 0.5;
    else if (!keysPressed.current.ArrowLeft && !keysPressed.current.ArrowRight)
      newPaddleVel.x = 0;

    let newPaddlePos = applyVelocity(pgs.paddlePos, pgs.paddleVel, deltaTime);
    [newPaddlePos, newPaddleVel] = handleContainerCollisions(
      container,
      paddle,
      newPaddlePos,
      newPaddleVel,
      false,
    );

    let newBallPos = applyVelocity(pgs.ballPos, pgs.ballVel, deltaTime);
    let newBallVel: vec2 = { ...pgs.ballVel };
    let collisions: collision_description = {
      top: false,
      bottom: false,
      right: false,
      left: false,
    };
    [newBallPos, newBallVel, collisions] = handleContainerCollisions(
      container,
      ball,
      newBallPos,
      newBallVel,
    );

    if (collisions.bottom) {
      newLives -= 1;
      if (newLives <= 0) {
        newState = GameEnum.GAMEOVER;
      }
    }

    // Handle collision with paddle
    [newBallPos, newBallVel, collisions] = handleBallRectangleCollision(
      ball,
      newBallVel,
      newBallPos,
      paddle,
    );

    if (collisions.top) {
      newBallVel.x += newPaddleVel.x * 0.2;
    }

    let newObstacles = [...pgs.obstacles];

    // Handle collision with obstacles
    let index = -1;
    for (let obstacle of obstacles.children) {
      index += 1;
      if (newObstacles[index].active == false) continue;
      if (obstacle instanceof HTMLDivElement) {
        [newBallPos, newBallVel, collisions] = handleBallRectangleCollision(
          ball,
          newBallVel,
          newBallPos,
          obstacle,
        );

        if (
          collisions.top ||
          collisions.bottom ||
          collisions.right ||
          collisions.left
        ) {
          newObstacles[index].active = false;
          newScore += newObstacles[index].score;
          break;
        }
      }
    }

    let obsLeft = 0;
    newObstacles.forEach((o) => {
      if (o.active) {
        obsLeft += 1;
      }
    });

    if (obsLeft == 0) {
      newState = GameEnum.YOUWON;
    }

    internalGameState.current = {
      ...pgs,
      paddlePos: newPaddlePos,
      paddleVel: newPaddleVel,
      ballPos: newBallPos,
      ballVel: newBallVel,
      obstacles: newObstacles,
      score: newScore,
      state: newState,
      lives: newLives,
    };
  };

  return (
    <>
      <div className="flex flex-row">
        <div
          className="w-[800px] h-[800px]"
          ref={containerRef}
          style={{ position: "relative" }}
        >
          <div className="grid grid-cols-4 gap-5 p-10" ref={obstacleContainer}>
            {gameState.obstacles.map((obs, index) => (
              <div
                key={index}
                className={`h-10 flex items-center justify-center ${obs.active ? "bg-blue-500 shadow text-gray-700 text-white font-bold" : "bg-gray-100 text-gray-100"}`}
              >
                <div className="mr-2">${obs.score.toFixed(2)}</div>
                <img
                  src={obs.img_path}
                  className={`w-25 shadow-lg ${!obs.active ? "hidden" : ""}`}
                ></img>
              </div>
            ))}
          </div>
          <Paddle position={gameState.paddlePos} ref={paddleRef} />
          <Ball position={gameState.ballPos} ref={ballRef} />
          <div
            className="bg-red-300 w-full h-6 text-center absolute"
            style={{ bottom: "-6px" }}
          >
            !!!!!!
          </div>
          {gameState.state == GameEnum.GAMEOVER ? (
            <div
              className="bg-red-400 border-2 border-red-500 text-white text-center w-fit p-5 rounded-xl shadow-xl absolute text-2xl font-bold"
              style={{ left: "320px", top: "300px" }}
            >
              GAME OVER!
            </div>
          ) : null}
          {gameState.state == GameEnum.YOUWON ? (
            <div
              className="bg-green-400 border-2 border-green-500 text-white text-center w-fit p-5 rounded-xl shadow-xl absolute text-2xl font-bold"
              style={{ left: "130px", top: "300px" }}
            >
              WINNER! YOU GOT ${gameState.score.toFixed(2)} OFF YOUR RECEIPT
            </div>
          ) : null}
          {gameState.state == GameEnum.NEEDSUPLOAD ? (
            <div
              className="bg-gray-200 border-2 border-gray-300 text-center w-fit p-5 rounded-xl shadow-xl absolute text-2xl font-bold"
              style={{ left: "150px", top: "300px" }}
            >
              <div className="mb-5">
                To start, please upload a photo of a receipt
              </div>
              <input
                className="file-input file-input-muted text-black"
                type="file"
                accept="image/png, image/jpeg"
                onChange={onReceiptUpload}
                disabled={uploading}
              />
              {uploading ? (
                <span className="loading loading-spinner loading-xl ms-3"></span>
              ) : null}
            </div>
          ) : null}
          {gameState.state == GameEnum.READYTOSELECT ? (
            <div
              className="bg-gray-200 border-2 border-gray-300 text-center w-fit p-5 rounded-xl shadow-xl absolute text-2xl font-bold"
              style={{ left: "50px", top: "300px" }}
            >
              <div className="mb-5">
                Earn your money back! Select a receipt from the right to start.
              </div>
            </div>
          ) : null}
        </div>
        <div className="ml-10 flex flex-col">
          <button
            className="btn btn-primary mt-10"
            onClick={handleNewGame}
            disabled={
              !(
                gameState.state == GameEnum.YOUWON ||
                gameState.state == GameEnum.GAMEOVER
              )
            }
          >
            New game
          </button>
          <button
            className="btn btn-primary mt-2"
            onClick={uploadNew}
            disabled={
              !(
                gameState.state == GameEnum.YOUWON ||
                gameState.state == GameEnum.GAMEOVER ||
                gameState.state == GameEnum.READYTOSELECT
              )
            }
          >
            Upload new
          </button>
          <div className="bg-gray-100 rounded-lg border-2 border-gray-200 h-fit p-2 mt-10">
            Earned: ${gameState.score.toFixed(2)}
          </div>
          <div className="bg-gray-100 rounded-lg border-2 border-gray-200 h-fit p-2 mt-5">
            Lives left: {gameState.lives}
          </div>
          {gameState.state == GameEnum.READYTOSELECT ||
          gameState.state == GameEnum.NEEDSUPLOAD ? (
            <div className="h-125 overflow-auto mt-10 overflow-x-hidden px-5 grid grid-cols-1">
              {receipts.map((r) => (
                <button
                  onClick={() => {
                    selectReceipt(r.id);
                  }}
                  disabled={gameState.state == GameEnum.NEEDSUPLOAD}
                  className="p-2 bg-gray-100 border-2 border-gray-200 rounded-lg mb-2 cursor-pointer w-fit h-fit"
                >
                  <img
                    className="h-40"
                    src={`http://127.0.0.1:8000/${r.path}`}
                  ></img>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

export default App;

import * as effects from './effects.js';
import { calculateTimeRemaining } from './lib/calculateTimeRemaining.js';
import * as i18n from './i18n/index.js';

export const Noop = state => state;

const emptyDrag = {
  active: false,
  type: null,
  from: null,
  to: null,
  clientX: null,
  clientY: null,
};

const emptyPrompt = {
  text: '',
  value: '',
  context: null,
  OnValue: Noop,
  visible: false,
};

const collectionMove = (collection, { from, to }) => {
  const newCollection = collection.reduce((memo, item, index) => {
    if (index === from) return memo;
    if (index === to) {
      return [...memo, collection[from], item];
    }
    return [...memo, item];
  }, []);
  if (to >= newCollection.length) {
    newCollection.push(collection[from]);
  }
  return newCollection;
};

export const Init = (_, { timerId, externals, dark, lang }) => [
  {
    timerStartedAt: null,
    timerDuration: 0,
    mob: [],
    goals: [],
    settings: {
      mobOrder: 'Navigator,Driver',
      duration: 5 * 60 * 1000,
    },
    expandedReorderable: null,
    timerTab: 'overview',
    drag: { ...emptyDrag },
    prompt: { ...emptyPrompt },
    timerId,
    currentTime: null,
    name: '',
    goal: '',
    addMultiple: false,
    allowNotification:
      externals.Notification && externals.Notification.permission === 'granted',
    allowSound: false,
    sound: 'horn',
    pendingSettings: {},
    websocketConnect: true,
    externals,
    toasts: [],
    dark,
    lang: i18n.withMissing(i18n[lang]) || i18n.en_CA,
    qrImage: null,
  },
  effects.checkSettings({
    storage: externals.storage,
    onLocalSoundEnabled: SoundToast,
    onDarkEnabled: SetDark,
  }),
  dark &&
  effects.andThen({
    action: SetDark,
    props: { dark },
  }),
  effects.removeQueryParameters(externals),
  effects.PreloadImage({
    src: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${externals.location}`,
    onLoad: OnQrLoad,
  }),
];

export const OnQrLoad = (state, { img }) => [{ ...state, qrImage: img }];

export const SetDark = (state, { dark }) => [
  { ...state, dark },
  effects.toggleDarkMode({
    documentElement: state.externals.documentElement,
    dark,
  }),
  effects.saveSettings({
    storage: state.externals.storage,
    data: { dark },
  }),
];

export const TestSound = state => [
  state,
  effects.PlaySound({
    sound: true,
    documentElement: state.externals.documentElement,
  }),
];

export const SetAddMultiple = (state, addMultiple) => ({
  ...state,
  addMultiple: Boolean(addMultiple),
});

export const SetCurrentTime = (state, { currentTime }) => {
  const nextState = {
    ...state,
    currentTime,
  };
  const remainingTime = calculateTimeRemaining(nextState);

  return [
    nextState,
    effects.UpdateTitleWithTime({
      remainingTime,
      documentElement: state.externals.documentElement,
    }),
  ];
};

export const ExpandReorderable = (state, { expandedReorderable }) => ({
  ...state,
  expandedReorderable,
});

export const PromptOpen = (
  state,
  { text, defaultValue, OnValue, context },
) => ({
  ...state,
  prompt: {
    text,
    value: defaultValue,
    OnValue,
    context,
    visible: true,
  },
});

export const PromptValueChange = (state, value) => ({
  ...state,
  prompt: {
    ...state.prompt,
    value,
  },
});

export const PromptOK = state => [
  {
    ...state,
    prompt: { ...emptyPrompt },
  },
  effects.andThen({
    action: state.prompt.OnValue,
    props: {
      ...state.prompt.context,
      value: state.prompt.value,
    },
  }),
];

export const PromptCancel = state => ({
  ...state,
  prompt: { ...emptyPrompt },
});

export const SetTimerTab = (state, timerTab) => ({
  ...state,
  timerTab,
});

export const DragSelect = (state, { type, from, clientX, clientY }) => ({
  ...state,
  drag: {
    active: false,
    type,
    from,
    to: null,
    clientX,
    clientY,
  },
});

export const DragMove = (state, { clientX, clientY }) => {
  if (!state.drag.active) {
    const diffX = state.drag.clientX - clientX;
    const diffY = state.drag.clientY - clientY;
    const distance = Math.sqrt(diffX * diffX + diffY * diffY);
    if (distance < 5) {
      return state;
    }
    return {
      ...state,
      drag: {
        ...state.drag,
        active: true,
        to: state.drag.from,
        clientX,
        clientY,
      },
    };
  }

  return {
    ...state,
    drag: {
      ...state.drag,
      active: true,
      clientX,
      clientY,
    },
  };
};

export const DragTo = (state, { to }) => ({
  ...state,
  drag: {
    ...state.drag,
    to,
  },
});

export const DragCancel = state => ({
  ...state,
  drag: { ...emptyDrag },
});

export const EndTurn = state => [
  {
    ...state,
    timerStartedAt: null,
    timerDuration: 0,
  },
  effects.UpdateTitleWithTime({
    remainingTime: 0,
    documentElement: state.externals.documentElement,
  }),
  effects.Notify({
    notification: state.allowNotification,
    sound: state.allowSound,
    title: 'Mobtime',
    text: 'The timer is up!',
    Notification: state.externals.Notification,
    documentElement: state.externals.documentElement,
  }),
];

export const Completed = (state, { isEndOfTurn }) => {
  const nextState = {
    ...state,
    timerStartedAt: null,
    timerDuration: 0,
  };

  const extraEffects = [];
  if (isEndOfTurn) {
    extraEffects.push(
      effects.andThen({
        action: EndTurn,
        props: {},
      }),
    );
  }

  if (isEndOfTurn) {
    extraEffects.push(
      effects.andThen({
        action: CycleMob, // eslint-disable-line no-use-before-define
        props: {},
      }),
    );
  }

  return [
    nextState,
    effects.CompleteTimer({
      socketEmitter: state.externals.socketEmitter,
    }),
    ...extraEffects,
  ];
};

export const RenameUser = (state, { id, value }) => {
  const mob = state.mob.map(m => ({
    ...m,
    name: m.id === id ? value : m.name,
  }));

  return [
    {
      ...state,
      mob,
    },
    effects.UpdateMob({
      socketEmitter: state.externals.socketEmitter,
      mob,
    }),
  ];
};

export const RenameUserPrompt = (state, { id }) => {
  const user = state.mob.find(m => m.id === id);
  if (!user) return state;

  return [
    state,
    effects.andThen({
      action: PromptOpen,
      props: {
        text: `Rename ${user.name} to...`,
        defaultValue: user.name,
        OnValue: RenameUser,
        context: {
          id,
        },
      },
    }),
  ];
};

export const UpdateName = (state, name) => ({
  ...state,
  name,
});

export const ShuffleMob = state => {
  const mob = [...state.mob];
  for (let index = mob.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.round(Math.random() * index);
    const old = mob[index];
    mob[index] = mob[otherIndex];
    mob[otherIndex] = old;
  }

  return [
    {
      ...state,
      mob,
    },
    effects.UpdateMob({
      socketEmitter: state.externals.socketEmitter,
      mob,
    }),
  ];
};

export const CycleMob = state => {
  if (state.mob.length === 0) {
    return state;
  }

  const [first, ...rest] = state.mob;
  const mob = [...rest, first];
  const shouldComplete = state.timerStartedAt > 0;

  const effectsToRun = [
    effects.UpdateMob({
      socketEmitter: state.externals.socketEmitter,
      mob,
    }),
  ];

  if (shouldComplete) {
    effectsToRun.push(
      effects.andThen({
        action: Completed,
        props: { isEndOfTurn: true },
      }),
    );
  }

  return [
    {
      ...state,
      mob,
    },
    ...effectsToRun,
  ];
};

export const AddNameToMob = state => {
  const mob = state.mob.concat({
    id: Math.random()
      .toString(36)
      .slice(2),
    name: state.name,
  });

  return [
    {
      ...state,
      mob,
      name: '',
    },
    effects.UpdateMob({
      socketEmitter: state.externals.socketEmitter,
      mob,
    }),
  ];
};

export const RemoveFromMob = (state, id) => {
  const mob = state.mob.filter(m => m.id !== id);

  return [
    {
      ...state,
      mob,
    },
    effects.UpdateMob({
      socketEmitter: state.externals.socketEmitter,
      mob,
    }),
  ];
};

export const MoveMob = (state, { from, to }) => {
  const mob = collectionMove(state.mob, { from, to });

  return [
    {
      ...state,
      mob,
    },
    effects.UpdateMob({
      socketEmitter: state.externals.socketEmitter,
      mob,
    }),
  ];
};

export const AddGoal = state => {
  const goals = state.goals.concat({
    id: Math.random()
      .toString(36)
      .slice(2),
    text: state.goal,
    completed: false,
  });

  return [
    {
      ...state,
      goals,
      goal: '',
    },
    effects.UpdateGoals({
      socketEmitter: state.externals.socketEmitter,
      goals,
    }),
  ];
};
export const AddGoals = (state, goals) => {
  const allGoals = state.goals.concat(
    goals
      .split('\n')
      .map(text => text.trim())
      .filter(text => text.length > 0)
      .map(text => ({
        id: Math.random()
          .toString(36)
          .slice(2),
        text,
        completed: false,
      })),
  );

  return [
    {
      ...state,
      goals: allGoals,
      goal: '',
    },
    effects.UpdateGoals({
      socketEmitter: state.externals.socketEmitter,
      goals: allGoals,
    }),
  ];
};

export const CompleteGoal = (state, { id, completed }) => {
  const goals = state.goals.map(g => ({
    ...g,
    completed: g.id === id ? completed : g.completed,
  }));

  return [
    {
      ...state,
      goals,
    },
    effects.UpdateGoals({
      socketEmitter: state.externals.socketEmitter,
      goals,
    }),
  ];
};
export const RemoveGoal = (state, id) => {
  const goals = state.goals.filter(g => g.id !== id);
  return [
    {
      ...state,
      goals,
    },
    effects.UpdateGoals({
      socketEmitter: state.externals.socketEmitter,
      goals,
    }),
  ];
};

export const RemoveCompletedGoals = state => {
  const incompleteGoals = state.goals.filter(g => !g.completed);
  const goalsAreRemoved = incompleteGoals.length < state.goals.length;
  return [
    {
      ...state,
      goals: incompleteGoals,
    },
    goalsAreRemoved
      ? effects.UpdateGoals({
        socketEmitter: state.externals.socketEmitter,
        goals: incompleteGoals,
      })
      : undefined,
  ];
};

export const MoveGoal = (state, { from, to }) => {
  const goals = collectionMove(state.goals, { from, to });

  return [
    {
      ...state,
      goals,
    },
    effects.UpdateGoals({
      socketEmitter: state.externals.socketEmitter,
      goals,
    }),
  ];
};

export const RenameGoal = (state, { id, value }) => {
  const goals = state.goals.map(g => ({
    ...g,
    text: g.id === id ? value : g.text,
  }));
  return [
    {
      ...state,
      goals,
    },
    effects.UpdateGoals({
      socketEmitter: state.externals.socketEmitter,
      goals,
    }),
  ];
};
export const RenameGoalPrompt = (state, { id }) => {
  const goal = state.goals.find(g => g.id === id);
  if (!goal) return state;

  return [
    state,
    effects.andThen({
      action: PromptOpen,
      props: {
        text: `Rename ${goal.text.length > 32 ? goal.text.slice(0, 29) + '...' : goal.text
          } to...`,
        defaultValue: goal.text,
        OnValue: RenameGoal,
        context: {
          id,
        },
      },
    }),
  ];
};

export const UpdateGoalText = (state, goal) => [
  {
    ...state,
    goal,
  },
];

export const PauseTimer = (state, currentTime = Date.now()) => {
  const elapsed = currentTime - state.timerStartedAt;
  const timerDuration = Math.max(0, state.timerDuration - elapsed);

  return [
    {
      ...state,
      timerStartedAt: null,
      timerDuration,
      currentTime,
    },
    effects.PauseTimer({
      socketEmitter: state.externals.socketEmitter,
      timerDuration,
    }),
  ];
};

export const ResumeTimer = (state, timerStartedAt = Date.now()) => [
  {
    ...state,
    timerStartedAt,
    currentTime: timerStartedAt,
  },
  effects.StartTimer({
    socketEmitter: state.externals.socketEmitter,
    timerDuration: state.timerDuration,
  }),
];

export const StartTimer = (state, { timerStartedAt, timerDuration }) => [
  {
    ...state,
    timerStartedAt,
    currentTime: timerStartedAt,
    timerDuration,
  },
  effects.StartTimer({
    socketEmitter: state.externals.socketEmitter,
    timerDuration,
  }),
];

export const SetAllowNotification = (state, { allowNotification }) => [
  {
    ...state,
    allowNotification,
  },
  allowNotification &&
  effects.Notify({
    title: 'Mobtime Config',
    text: 'You have allowed notifications',
    sound: false,
    Notification: state.externals.Notification,
    documentElement: state.externals.documentElement,
  }),
];

export const UpdateNotificationPermissions = state => [
  {
    ...state,
  },
  state.externals.Notification &&
  state.externals.Notification.permission === 'granted' &&
  effects.andThen({
    action: SetAllowNotification,
    props: { allowNotification: true },
  }),
];

export const RequestNotificationPermission = state => [
  state,
  effects.NotificationPermission({
    UpdateNotificationPermissions,
    Notification: state.externals.Notification,
    documentElement: state.externals.documentElement,
  }),
];

export const SetAllowSound = (state, allowSound) => [
  {
    ...state,
    allowSound,
  },
  effects.saveSettings({
    storage: state.externals.storage,
    data: {
      allowSound,
      sound: state.sound,
    },
  }),
];

export const SetSound = (state, noise) => {
  const sound = noise.split('/')[0];
  return [
    {
      ...state,
      sound,
    },
    effects.saveSettings({
      storage: state.externals.storage,
      data: {
        allowSound: state.allowSound,
        sound,
      },
    }),
  ];
};

export const RemoveToast = (state, id) => [
  {
    ...state,
    toasts: state.toasts.filter(t => t.id !== id),
  },
];

export const AddToast = (state, toast) => {
  const id =
    toast.id ||
    Math.random()
      .toString(36)
      .slice(2);
  return [
    {
      ...state,
      toasts: [...state.toasts.filter(t => t.id !== id), { ...toast, id }],
    },
  ];
};

export const SoundToast = (state, { sound }) => [
  {
    ...state,
    sound,
  },
  effects.andThen({
    action: AddToast,
    props: {
      id: 'sound-effects',
      title: state.lang.toasts.soundEffects.title,
      body: state.lang.toasts.soundEffects.body,
      buttons: {
        left: [
          {
            text: state.lang.toasts.soundEffects.okay,
            class: ['bg-green-600', 'text-white', 'mr-1'],
            actions: [{ action: SetAllowSound, props: true }],
          },
          {
            text: state.lang.toasts.soundEffects.notNow,
            class: [],
            actions: [],
          },
        ],
        right: [
          {
            text: state.lang.toasts.soundEffects.never,
            class: ['bg-red-600', 'text-white'],
            actions: [
              {
                action: s => [
                  s,
                  effects.saveSettings({
                    storage: s.externals.storage,
                    data: {
                      allowSound: false,
                    },
                  }),
                ],
                props: {},
              },
            ],
          },
        ],
      },
    },
  }),
];

export const WebsocketReconnect = (state, _error) => [
  { ...state, websocketConnect: true },
];

export const WebsocketDisconnected = (state, error) => [
  {
    ...state,
    websocketConnect: false,
  },
  effects.andThen({
    action: WebsocketReconnect,
    props: error,
    delay: 1000,
  }),
  // effects.andThen({
  //   action: AddToast,
  //   props: {
  //     id: 'websocket-disconnected',
  //     title: state.lang.toasts.websocketDisconnect.title,
  //     body: error,
  //     buttons: {
  //       left: [],
  //       right: [
  //         {
  //           text: state.lang.toasts.websocketDisconnect.reconnect,
  //           class: ['bg-green-600', 'text-white', 'mr-1'],
  //           actions: [{ action: WebsocketReconnect, props: {} }],
  //         },
  //       ],
  //     },
  //   },
  // }),
];

export const PendingSettingsReset = state => ({
  ...state,
  pendingSettings: {},
});

export const PendingSettingsSet = (state, { key, value }) => ({
  ...state,
  pendingSettings: {
    ...state.pendingSettings,
    [key]: value,
  },
});

export const UpdateSettings = state => {
  const settings = {
    ...state.settings,
    ...state.pendingSettings,
  };

  return [
    {
      ...state,
      settings,
      pendingSettings: {},
    },
    effects.UpdateSettings({
      socketEmitter: state.externals.socketEmitter,
      settings,
    }),
  ];
};

export const UpdateByWebsocketData = (state, { payload }) => {
  const { type, ...data } = payload;
  switch (type) {
    case 'settings:update':
      return {
        ...state,
        settings: data.settings,
      };

    case 'timer:start':
      return {
        ...state,
        timerStartedAt: Date.now(),
        timerDuration: data.timerDuration,
      };

    case 'timer:pause':
      return {
        ...state,
        timerStartedAt: null,
        timerDuration: data.timerDuration,
      };

    case 'timer:update':
      return {
        ...state,
        timerStartedAt: data.timerStartedAt,
        timerDuration: data.timerDuration,
      };

    case 'timer:complete':
      if (state.timerStartedAt === null && state.timerDuration === 0) {
        return state;
      }

      return [
        state,
        effects.andThen({
          action: EndTurn,
          props: {},
        }),
      ];

    case 'goals:update':
      return {
        ...state,
        goals: data.goals,
      };

    case 'mob:update':
      return {
        ...state,
        mob: data.mob,
      };

    default:
      // console.warn('Unknown websocket data', payload); // eslint-disable-line no-console
      return state;
  }
};

export const DragEnd = state => {
  const badDrag =
    !state.drag.active ||
    state.drag.to === null ||
    state.drag.to === state.drag.from;

  if (badDrag) {
    return { ...state, drag: { ...emptyDrag } };
  }

  return [
    {
      ...state,
      drag: { ...emptyDrag },
    },
    state.drag.type === 'mob'
      ? effects.andThen({ action: MoveMob, props: state.drag })
      : effects.andThen({ action: MoveGoal, props: state.drag }),
  ];
};

/** Ids das cenas e seus parâmetros. Toda cena nova precisa de uma entrada aqui. */
declare module '@core/scenes/scene_manager' {
  interface SceneParams {
    boot: void;
    main_menu: void;
    gameplay: { continue: boolean };
  }
}

export {};

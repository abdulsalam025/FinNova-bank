import { useCallback, useEffect, useRef, useState } from "react";

function isCanceled(error) {
  return error?.code === "ERR_CANCELED" || error?.name === "CanceledError";
}

/* One independent panel: own request, status, error, retry and a stale-response
   guard. AbortController cancels superseded requests; a sequence id discards
   late responses so outdated results never overwrite newer filter results. */
export function usePanel(load, depsKey, failureText, makeMessage) {
  const [state, setState] = useState({ status: "loading", data: null, message: "" });
  const sequence = useRef(0);
  const controllerRef = useRef(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  const run = useCallback(() => {
    const id = ++sequence.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState((current) => ({ status: "loading", data: current.data, message: "" }));
    loadRef.current(controller.signal)
      .then((data) => {
        if (id === sequence.current) setState({ status: "success", data, message: "" });
      })
      .catch((error) => {
        if (id !== sequence.current || isCanceled(error)) return;
        setState({ status: "error", data: null, message: makeMessage(error, failureText) });
      });
  }, [failureText, makeMessage]);

  useEffect(() => {
    run();
    return () => {
      sequence.current += 1;
      controllerRef.current?.abort();
    };
  }, [run, depsKey]);

  return { ...state, reload: run };
}
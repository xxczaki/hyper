/* global Blob,URL,requestAnimationFrame */
import React from 'react';
import {Terminal} from 'xterm';
import * as fit from 'xterm/lib/addons/fit/fit';
import {clipboard} from 'electron';
import * as Color from 'color';
import {PureComponent} from '../base-components';
import terms from '../terms';
import processClipboard from '../utils/paste';

Terminal.applyAddon(fit);

// map old hterm constants to xterm.js
const CURSOR_STYLES = {
  BEAM: 'bar',
  UNDERLINE: 'underline',
  BLOCK: 'block'
};

const getTermOptions = props => {
  // Set a background color only if it is opaque
  const backgroundColor = Color(props.backgroundColor).alpha() < 1 ? 'transparent' : props.backgroundColor;
  return {
    cursorStyle: CURSOR_STYLES[props.cursorShape],
    cursorBlink: props.cursorBlink,
    fontFamily: props.fontFamily,
    fontSize: props.fontSize,
    allowTransparency: true,
    theme: {
      foreground: props.foregroundColor,
      background: backgroundColor,
      cursor: props.cursorColor,
      cursorAccent: props.cursorAccentColor,
      selection: props.selectionColor,
      black: props.colors.black,
      red: props.colors.red,
      green: props.colors.green,
      yellow: props.colors.yellow,
      blue: props.colors.blue,
      magenta: props.colors.magenta,
      cyan: props.colors.cyan,
      white: props.colors.white,
      brightBlack: props.colors.lightBlack,
      brightRed: props.colors.lightRed,
      brightGreen: props.colors.lightGreen,
      brightYellow: props.colors.lightYellow,
      brightBlue: props.colors.lightBlue,
      brightMagenta: props.colors.lightMagenta,
      brightCyan: props.colors.lightCyan,
      brightWhite: props.colors.lightWhite
    }
  };
};

export default class Term extends PureComponent {
  constructor(props) {
    super(props);
    props.ref_(props.uid, this);
    this.termRef = null;
    this.termWrapperRef = null;
    this.termRect = null;
    this.onOpen = this.onOpen.bind(this);
    this.onWindowResize = this.onWindowResize.bind(this);
    this.onWindowPaste = this.onWindowPaste.bind(this);
    this.onTermRef = this.onTermRef.bind(this);
    this.onTermWrapperRef = this.onTermWrapperRef.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.termOptions = {};
  }

  componentDidMount() {
    const {props} = this;

    this.termOptions = getTermOptions(props);
    this.term = props.term || new Terminal(this.termOptions);
    this.term.attachCustomKeyEventHandler(this.keyboardHandler);
    this.term.open(this.termRef);
    if (props.term) {
      //We need to set options again after reattaching an existing term
      Object.keys(this.termOptions).forEach(option => this.term.setOption(option, this.termOptions[option]));
    }

    this.onOpen(this.termOptions);

    if (props.onTitle) {
      this.term.on('title', props.onTitle);
    }

    if (props.onActive) {
      this.term.on('focus', () => {
        // xterm@2 emits this event 2 times. Will be fixed in xterm@3.
        if (!this.props.isTermActive) {
          props.onActive();
        }
      });
    }

    if (props.onData) {
      this.term.on('data', props.onData);
    }

    if (props.onResize) {
      this.term.on('resize', ({cols, rows}) => {
        props.onResize(cols, rows);
      });
    }

    window.addEventListener('resize', this.onWindowResize, {
      passive: true
    });

    window.addEventListener('paste', this.onWindowPaste, {
      capture: true
    });

    terms[this.props.uid] = this;
  }

  onOpen(termOptions) {
    // we need to delay one frame so that aphrodite styles
    // get applied and we can make an accurate measurement
    // of the container width and height
    requestAnimationFrame(() => {
      // at this point it would make sense for character
      // measurement to have taken place but it seems that
      // xterm.js might be doing this asynchronously, so
      // we force it instead
      // eslint-disable-next-line no-debugger
      //debugger;
      this.term.charMeasure.measure(termOptions);
      this.fitResize();
    });
  }

  getTermDocument() {
    // eslint-disable-next-line no-console
    console.warn(
      'The underlying terminal engine of Hyper no longer ' +
        'uses iframes with individual `document` objects for each ' +
        'terminal instance. This method call is retained for ' +
        "backwards compatibility reasons. It's ok to attach directly" +
        'to the `document` object of the main `window`.'
    );
    return document;
  }

  onWindowResize() {
    this.fitResize();
  }

  // intercepting paste event for any necessary processing of
  // clipboard data, if result is falsy, paste event continues
  onWindowPaste(e) {
    if (!this.props.isTermActive) return;

    const processed = processClipboard();
    if (processed) {
      e.preventDefault();
      e.stopPropagation();
      this.term.send(processed);
    }
  }

  onMouseUp(e) {
    if (this.props.quickEdit && e.button === 2) {
      if (this.term.hasSelection()) {
        clipboard.writeText(this.term.getSelection());
        this.term.clearSelection();
      } else {
        document.execCommand('paste');
      }
    } else if (this.props.copyOnSelect && this.term.hasSelection()) {
      clipboard.writeText(this.term.getSelection());
    }
  }

  write(data) {
    this.term.write(data);
  }

  focus() {
    this.term.focus();
  }

  clear() {
    this.term.clear();
  }

  reset() {
    this.term.reset();
  }

  resize(cols, rows) {
    this.term.resize(cols, rows);
  }

  fitResize() {
    if (!this.termWrapperRef) {
      return;
    }
    this.term.fit();
  }

  keyboardHandler(e) {
    // Has Mousetrap flagged this event as a command?
    return !e.catched;
  }

  componentWillReceiveProps(nextProps) {
    if (!this.props.cleared && nextProps.cleared) {
      this.clear();
    }
    const nextTermOptions = getTermOptions(nextProps);

    // Update only options that have changed.
    Object.keys(nextTermOptions)
      .filter(option => option !== 'theme' && nextTermOptions[option] !== this.termOptions[option])
      .forEach(option => this.term.setOption(option, nextTermOptions[option]));

    // Do we need to update theme?
    const shouldUpdateTheme =
      !this.termOptions.theme ||
      Object.keys(nextTermOptions.theme).some(option => {
        nextTermOptions.theme[option] !== this.termOptions.theme[option];
      });
    if (shouldUpdateTheme) {
      this.term.setOption('theme', nextTermOptions.theme);
    }

    this.termOptions = nextTermOptions;

    if (!this.props.isTermActive && nextProps.isTermActive) {
      requestAnimationFrame(() => {
        this.term.charMeasure.measure(this.termOptions);
        this.fitResize();
      });
    }

    if (this.props.fontSize !== nextProps.fontSize || this.props.fontFamily !== nextProps.fontFamily) {
      // invalidate xterm cache about how wide each
      // character is
      this.term.charMeasure.measure(this.termOptions);

      // resize to fit the container
      this.fitResize();
    }

    if (nextProps.rows !== this.props.rows || nextProps.cols !== this.props.cols) {
      this.resize(nextProps.cols, nextProps.rows);
    }
  }

  onTermWrapperRef(component) {
    this.termWrapperRef = component;
  }

  onTermRef(component) {
    this.termRef = component;
  }

  componentWillUnmount() {
    terms[this.props.uid] = null;
    this.props.ref_(this.props.uid, null);

    // to clean up the terminal, we remove the listeners
    // instead of invoking `destroy`, since it will make the
    // term insta un-attachable in the future (which we need
    // to do in case of splitting, see `componentDidMount`
    ['title', 'focus', 'data', 'resize'].forEach(type => this.term.removeAllListeners(type));

    window.removeEventListener('resize', this.onWindowResize, {
      passive: true
    });

    window.removeEventListener('paste', this.onWindowPaste, {
      capture: true
    });
  }

  template(css) {
    return (
      <div
        className={css('fit', this.props.isTermActive && 'active')}
        style={{padding: this.props.padding}}
        onMouseUp={this.onMouseUp}
      >
        {this.props.customChildrenBefore}
        <div ref={this.onTermWrapperRef} className={css('fit', 'wrapper')}>
          <div ref={this.onTermRef} className={css('fit', 'term')} />
        </div>
        {this.props.customChildren}
      </div>
    );
  }

  styles() {
    return {
      fit: {
        display: 'block',
        width: '100%',
        height: '100%'
      },
      wrapper: {
        // TODO: decide whether to keep this or not based on
        // understanding what xterm-selection is for
        overflow: 'hidden'
      },
      term: {}
    };
  }
}

define(function (require, exports, module) {
    "use strict";

    var LanguageManager = brackets.getModule("language/LanguageManager"),
        CodeMirror      = brackets.getModule("thirdparty/CodeMirror/lib/codemirror");

    brackets.getModule(["thirdparty/CodeMirror/mode/javascript/javascript"], function () {

        CodeMirror.defineMode("ballerina", function (config, parserConfig) {
            
            var ERRORCLASS = 'error';

            function wordRegexp(words) {
                return new RegExp("^((" + words.join(")|(") + "))\\b", "i");
            }

            var singleOperators = new RegExp("^[\\+\\-\\*/%&\\\\|\\^~<>!]");
            var singleDelimiters = new RegExp('^[\\(\\)\\[\\]\\{\\}@,:`=;\\.]');
            var doubleOperators = new RegExp("^((==)|(<>)|(<=)|(>=)|(<>)|(<<)|(>>)|(//)|(\\*\\*))");
            var doubleDelimiters = new RegExp("^((\\+=)|(\\-=)|(\\*=)|(%=)|(/=)|(&=)|(\\|=)|(\\^=))");
            var tripleDelimiters = new RegExp("^((//=)|(>>=)|(<<=)|(\\*\\*=))");
            var identifiers = new RegExp("^[_A-Za-z][_A-Za-z0-9]*");

            var openingKeywords = ['if','try','while','fork'];
            var middleKeywords = ['else','elseif','catch'];
            var endKeywords = ['throw','return','reply','break','iterate','join','timeout','exception'];

            var operatorKeywords = ['in'];
            var wordOperators = wordRegexp(operatorKeywords);
            var commonKeywords = ['string','const','boolean','int','float','long','double','message','map','xml','xmldocument','json','struct','array'];
            var commontypes = ['import','service','resource','reply','resource','function','connector','action','worker','create'];

            var keywords = wordRegexp(commonKeywords);
            var types = wordRegexp(commontypes);
            var stringPrefixes = '"';

            var opening = wordRegexp(openingKeywords);
            var middle = wordRegexp(middleKeywords);
            var closing = wordRegexp(endKeywords);
            var doubleClosing = wordRegexp(['}']);
            var doOpening = wordRegexp(['{']);
            var importOpening = wordRegexp(['import']);
            var commentOpening = wordRegexp(['\/\/.+']);

            var indentInfo = null;

            CodeMirror.registerHelper("hintWords", "bal", openingKeywords.concat(middleKeywords).concat(endKeywords)
                                        .concat(operatorKeywords).concat(commonKeywords).concat(commontypes));

            function indent(_stream, state) {
              state.currentIndent++;
            }

            function dedent(_stream, state) {
              state.currentIndent--;
            }
            
            // tokenizers
            function tokenBase(stream, state) {
                if (stream.eatSpace()) {
                    return null;
                }

                var ch = stream.peek();
        
                // Handle Imports
                if (stream.match(importOpening)) {
                    return 'keyword';
                }

                // Handle Comments
                if (stream.match(commentOpening)) {
                    //stream.skipToEnd();
                    return 'comment';
                }
                
                // Handle Annotation
                if(stream.match(/\@(.*?)\w+/i)){
                    return 'number';
                }
                
                if(stream.match(/(\w+)\s*:(?!@)/)){
                    return 'def';
                }

                // Handle Number Literals
                if (stream.match(/^((&H)|(&O))?[0-9\.a-f]/i, false)) {
                    var floatLiteral = false;
                    // Floats
                    if (stream.match(/^\d*\.\d+F?/i)) { floatLiteral = true; }
                    else if (stream.match(/^\d+\.\d*F?/)) { floatLiteral = true; }
                    else if (stream.match(/^\.\d+F?/)) { floatLiteral = true; }

                    if (floatLiteral) {
                        // Float literals may be "imaginary"
                        stream.eat(/J/i);
                        return 'number';
                    }
                    // Integers
                    var intLiteral = false;
                    // Hex
                    if (stream.match(/^&H[0-9a-f]+/i)) { intLiteral = true; }
                    // Octal
                    else if (stream.match(/^&O[0-7]+/i)) { intLiteral = true; }
                    // Decimal
                    else if (stream.match(/^[1-9]\d*F?/)) {
                        // Decimal literals may be "imaginary"
                        stream.eat(/J/i);
                        // TODO - Can you have imaginary longs?
                        intLiteral = true;
                    }
                    // Zero by itself with no other piece of number.
                    else if (stream.match(/^0(?![\dx])/i)) { intLiteral = true; }
                    if (intLiteral) {
                        // Integer literals may be "long"
                        stream.eat(/L/i);
                        return 'number';
                    }
                }

                // Handle Strings
                if (stream.match(stringPrefixes)) {
                    state.tokenize = tokenStringFactory(stream.current());
                    return state.tokenize(stream, state);
                }

                // Handle operators and Delimiters
                if (stream.match(tripleDelimiters) || stream.match(doubleDelimiters)) {
                    return null;
                }
                if (stream.match(doubleOperators)
                    || stream.match(singleOperators)
                    || stream.match(wordOperators)) {
                    return 'operator';
                }
                if (stream.match(singleDelimiters)) {
                    return null;
                }
                if (stream.match(doOpening)) {
                    indent(stream,state);
                    state.doInCurrentLine = true;
                    return 'keyword';
                }
                if (stream.match(opening)) {
                    if (! state.doInCurrentLine)
                      indent(stream,state);
                    else
                      state.doInCurrentLine = false;
                    return 'keyword';
                }
                if (stream.match(middle)) {
                    return 'keyword';
                }

                if (stream.match(doubleClosing)) {
                    dedent(stream,state);
                    dedent(stream,state);
                    return 'keyword';
                }
                if (stream.match(closing)) {
                    dedent(stream,state);
                    return 'keyword';
                }

                if (stream.match(types)) {
                    return 'keyword';
                }

                if (stream.match(keywords)) {
                    return 'def';
                }

                if (stream.match(identifiers)) {
                    return 'variable';
                }

                // Handle non-detected items
                stream.next();
                return ERRORCLASS;
            }

            function tokenStringFactory(delimiter) {
                var singleline = delimiter.length == 1;
                var OUTCLASS = 'string';

                return function(stream, state) {
                    while (!stream.eol()) {
                        stream.eatWhile(/[^'"]/);
                        if (stream.match(delimiter)) {
                            state.tokenize = tokenBase;
                            return OUTCLASS;
                        } else {
                            stream.eat(/['"]/);
                        }
                    }
                    if (singleline) {
                        if (parserConfig.singleLineStringErrors) {
                            return ERRORCLASS;
                        } else {
                            state.tokenize = tokenBase;
                        }
                    }
                    return OUTCLASS;
                };
            }


            function tokenLexer(stream, state) {
                var style = state.tokenize(stream, state);
                var current = stream.current();

                // Handle '.' connected identifiers
                if (current === '.') {
                    style = state.tokenize(stream, state);
                    current = stream.current();
                    if (style === 'variable') {
                        return 'variable';
                    } else {
                        return null;//ERRORCLASS;
                    }
                }


                var delimiter_index = '[({'.indexOf(current);
                if (delimiter_index !== -1) {
                    indent(stream, state );
                }
                if (indentInfo === 'dedent') {
                    if (dedent(stream, state)) {
                        return ERRORCLASS;
                    }
                }
                delimiter_index = '])}'.indexOf(current);
                if (delimiter_index !== -1) {
                    if (dedent(stream, state)) {
                        return ERRORCLASS;
                    }
                }

                return style;
            }

        	var external = {
                electricChars:"fFtTpcCvVsSPiIfFeE",
                startState: function() {
                    return {
                      tokenize: tokenBase,
                      lastToken: null,
                      currentIndent: 0,
                      nextLineIndent: 0,
                      doInCurrentLine: false
                  };
                },

                token: function(stream, state) {
                    if (stream.sol()) {
                      state.currentIndent += state.nextLineIndent;
                      state.nextLineIndent = 0;
                      state.doInCurrentLine = 0;
                    }
                    var style = tokenLexer(stream, state);

                    state.lastToken = {style:style, content: stream.current()};

                    return style;
                },

                indent: function(state, textAfter) {
                    var trueText = textAfter.replace(/^\s+|\s+$/g, '') ;
                    if (trueText.match(closing) || trueText.match(doubleClosing) || trueText.match(middle)) return conf.indentUnit*(state.currentIndent-1);
                    if(state.currentIndent < 0) return 0;
                    return state.currentIndent * conf.indentUnit;
                },

                //lineComment: "//"
            };
            return external;

        });

        CodeMirror.defineMIME("text/x-ballerina", "ballerina");
    
	    LanguageManager.defineLanguage("ballerina", {
	        name: "Ballerina",
	        mode: ["ballerina", "text/x-ballerina"],
	        fileExtensions: ["bal"]
	    });
    });
});

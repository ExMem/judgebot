const _ = require('lodash');
const request = require("request");
const log = require("log4js").getLogger('cr');
const Discord = require('discord.js');

// Using the current CR as the default, not sure if they actually stick around once new ones are published
const CR_ADDRESS = process.env.CR_ADDRESS || "https://sites.google.com/site/mtgfamiliar/rules/MagicCompRules.txt";

class CR {
    constructor() {
        this.location = "http://blogs.magicjudges.org/rules/cr";
        this.commands = ["define", "cr", "rule"];
        this.glossary = {};
        this.thumbnail = 'https://assets.magicjudges.org/judge-banner/images/magic-judge.png';
        this.crData = {};
        this.maxLength = 2040;

        request({url: CR_ADDRESS}, (error, response, body) => {
            if (!error && response.statusCode === 200) {
                this.initCR(body);
            } else {
                log.error("Error loading CR: " + error);
            }
        });
    }

    getCommands() {
        return this.commands;
    }

    initCR(crText) {
        crText = crText.replace(/\r/g, "");
        let rulesText = crText.substring(crText.search("\nRULES_VERYLONGSTRINGOFLETTERSUNLIKELYTOBEFOUNDINTHEACTUALRULES\n") + 1, crText.length);
        const glossaryStartIndex = rulesText.search("\nGLOSSARY_VERYLONGSTRINGOFLETTERSUNLIKELYTOBEFOUNDINTHEACTUALRULES\n") + 1;
        const glossaryText = rulesText.substring(glossaryStartIndex, rulesText.search("\nEOF_VERYLONGSTRINGOFLETTERSUNLIKELYTOBEFOUNDINTHEACTUALRULES\n") + 1);
        rulesText = rulesText.substring(0, glossaryStartIndex);

        this.glossary = this.parseGlossary(glossaryText);
        this.crData = this.parseRules(rulesText, this.glossary);
        this.crData.description = crText.split('\n')[0];
        log.info("CR Ready");
    }

    parseGlossary(glossaryText) {
        const glossaryEntries = {};

        for (const entry of glossaryText.split("\n\n")) {
            if (!entry.trim()) {
                continue;
            }
            let [term, definition] = entry.split("\n", 2);
            if (!term || !definition) {
                continue;
            }
            definition = `**${term}**\n${this.highlightRules(definition)}`;
            for (const t of term.split(",")) {
                glossaryEntries[t.trim().toLowerCase()] = definition;
            }
        }
        return glossaryEntries;
    }

    parseRules(crText, glossaryEntries) {
        const ruleNumberPrefixRe = /^(\d{3}\.\w+)\.?/;
        const crEntries = {};

        for (let entry of crText.split("\n\n")) {
            if (!ruleNumberPrefixRe.test(entry)) {
                continue;
            }
            const number = entry.split(" ", 1)[0].replace(/\.$/, "");
            entry = entry.replace(ruleNumberPrefixRe, "__**$1**__");
            const newEntry = [];
            for (const word of entry.split(" ")) {
                if (glossaryEntries[word]) {
                    newEntry.push(`__${word}__`);
                } else {
                    newEntry.push(word);
                }
            }
            entry = this.highlightRules(newEntry.join(" "));

            crEntries[number] = '';
            entry.split('\n').forEach(line => {
                if (line.match(/^Example: /i)) {
                    if (!crEntries[number+' ex']) crEntries[number+' ex'] = '';
                    crEntries[number+' ex'] += line.replace(/^Example: /i, '**Example:** ') + '\n\n';
                } else {
                    crEntries[number] += line + '\n';
                }
            })
        }
        return crEntries;
    }

    highlightRules(text) {
        return text.replace(/rule \d{3}\.\w*\.?/ig, "**$&**");
    }

    appendSubrules(parameter) {
        let description = this.crData[parameter];
        if (description && this.crData[parameter + 'a']) {
            // keep looking for subrules, starting with "123a" and going until "123z" or we don't find another subrule
            for(let x = 'a'.charCodeAt(0); this.crData[parameter + String.fromCharCode(x)]; x++) {
                description += '\n' + this.crData[parameter + String.fromCharCode(x)];
            }
        }
        return description;
    }

    handleMessage(command, parameter, msg) {
        // use only the first parameter
        let cleanParam = parameter.trim().split(" ")[0].replace(/\.$/, "").toLowerCase();
        // in case there is a second parameter "ex", append it too
        if (parameter.toLowerCase().split(" ")[1] == "ex") cleanParam += ' ex';

        if (command === "cr" || command === "rule") {
            const embed = new Discord.RichEmbed({
                title: 'Comprehensive Rules',
                description: 'Effective '+this.crData.description,
                thumbnail: {url: this.thumbnail},
                url: this.location + '/'
            });
            if (cleanParam && this.crData[cleanParam]) {
                embed.setTitle('CR - Rule '+cleanParam.replace(/ ex$/,' Examples'));
                embed.setDescription(_.truncate(this.appendSubrules(cleanParam), {length: this.maxLength, separator: '\n'}));
                embed.setURL(this.location + cleanParam.substr(0,3) + '/');
                if (this.crData[cleanParam + ' ex']) {
                    embed.setFooter('Use "!cr '+cleanParam+' ex" to see examples.');
                }
            }
            return msg.channel.send('', {embed});
        } else if (command === "define" && cleanParam && this.glossary[cleanParam]) {
            const embed = new Discord.RichEmbed({
                title: 'CR - Glossary for "'+cleanParam+'"',
                description: this.glossary[cleanParam],
                thumbnail: {url: this.thumbnail},
                url: this.location + '/cr-glossary/'
            });
            const rule = this.glossary[cleanParam].match(/rule (\d+\.\w+)/i);
            if (rule && this.crData[rule[1]]) {
                embed.addField('CR - Rule '+rule[1], _.truncate(this.appendSubrules(rule[1]), {length: 1020, separator: '\n'}));
            }
            return msg.channel.send('', {embed});
        }
    }
}

module.exports = CR;
